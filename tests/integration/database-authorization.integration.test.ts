import { parseUserId } from '../../packages/auth/src/index.js';
import {
  OrganizationAuthorizationService,
  parsePermissionCode,
  PostgresAuthorizationRepository,
  withAuthorizedOrganizationTransaction,
} from '../../packages/authorization/src/index.js';
import { parseOrganizationId } from '../../packages/domain/src/index.js';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseDatabaseRuntimeConfig } from '../../packages/database/src/runtime/config.js';
import {
  createDatabasePool,
  shutdownDatabasePool,
  type DatabasePool,
} from '../../packages/database/src/runtime/pool.js';
import {
  ORGANIZATION_CONTEXT_SETTING,
  setTransactionOrganizationContext,
} from '../../packages/database/src/runtime/tenant-context.js';
import { withTransaction } from '../../packages/database/src/runtime/transaction.js';
import {
  prepareIsolatedTestDatabase,
  readIsolatedTestDatabaseUrl,
  resetIsolatedTestDatabase,
} from '../../packages/database/src/testing/isolated-database.js';
import {
  createRuntimeTestDatabaseUrl,
  dropRuntimeTestRole,
  provisionRuntimeTestRole,
  RUNTIME_TEST_ROLE,
} from '../../packages/database/src/testing/runtime-role.js';

const AUTHORIZATION_TABLES = [
  'membership_role_assignments',
  'organization_memberships',
  'permissions',
  'role_permissions',
  'roles',
] as const;
const RLS_TABLES = AUTHORIZATION_TABLES.filter((table) => table !== 'permissions');
const ORGANIZATION_A = parseOrganizationId('01890f47-6c8a-7801-8a21-9b7c1d2e3801');
const ORGANIZATION_B = parseOrganizationId('01890f47-6c8a-7802-8a21-9b7c1d2e3802');
const USER_A = parseUserId('01890f47-6c8a-7803-8a21-9b7c1d2e3803');
const USER_B = parseUserId('01890f47-6c8a-7804-8a21-9b7c1d2e3804');
const USER_WITHOUT_MEMBERSHIP = parseUserId('01890f47-6c8a-7805-8a21-9b7c1d2e3805');
const MEMBERSHIP_A = '01890f47-6c8a-7806-8a21-9b7c1d2e3806';
const MEMBERSHIP_B = '01890f47-6c8a-7807-8a21-9b7c1d2e3807';
const INVITED_MEMBERSHIP = '01890f47-6c8a-7808-8a21-9b7c1d2e3808';
const ROLE_A = '01890f47-6c8a-7809-8a21-9b7c1d2e3809';
const ROLE_B = '01890f47-6c8a-7810-8a21-9b7c1d2e3810';
const DISABLED_ROLE = '01890f47-6c8a-7811-8a21-9b7c1d2e3811';
const ASSIGNMENT_A = '01890f47-6c8a-7812-8a21-9b7c1d2e3812';
const ASSIGNMENT_B = '01890f47-6c8a-7813-8a21-9b7c1d2e3813';
const DISABLED_ASSIGNMENT = '01890f47-6c8a-7814-8a21-9b7c1d2e3814';
const PROPERTY_A = '01890f47-6c8a-7815-8a21-9b7c1d2e3815';
const PROPERTY_B = '01890f47-6c8a-7816-8a21-9b7c1d2e3816';
const INVALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date('2026-01-01T00:00:00.000Z');
const READ_ORGANIZATION = parsePermissionCode('organization.read');
const MANAGE_ORGANIZATION = parsePermissionCode('organization.manage');

const databaseUrl = readIsolatedTestDatabaseUrl(process.env);
let administrativePool: Pool;
let runtimePool: DatabasePool;
let repository: PostgresAuthorizationRepository;
let service: OrganizationAuthorizationService;

async function seedAuthorizationModel(): Promise<void> {
  await administrativePool.query('insert into organizations (id) values ($1), ($2)', [
    ORGANIZATION_A,
    ORGANIZATION_B,
  ]);
  await administrativePool.query(
    'insert into properties (id, organization_id) values ($1,$2),($3,$4)',
    [PROPERTY_A, ORGANIZATION_A, PROPERTY_B, ORGANIZATION_B],
  );
  await administrativePool.query(
    `insert into users (id, preferred_email) values
      ($1, 'shared@example.invalid'), ($2, 'shared@example.invalid'), ($3, null)`,
    [USER_A, USER_B, USER_WITHOUT_MEMBERSHIP],
  );
  await administrativePool.query(
    `insert into external_identity_links
      (id, user_id, provider, provider_subject, first_seen_at, last_seen_at)
     values
      ('01890f47-6c8a-7817-8a21-9b7c1d2e3817',$1,'supabase','shared-subject-a',$3,$3),
      ('01890f47-6c8a-7818-8a21-9b7c1d2e3818',$2,'supabase','shared-subject-b',$3,$3)`,
    [USER_A, USER_B, NOW],
  );
  await administrativePool.query(
    `insert into organization_memberships
      (id, organization_id, user_id, status, invited_at, activated_at)
     values ($1,$2,$3,'active',$7,$7), ($4,$5,$6,'active',$7,$7)`,
    [MEMBERSHIP_A, ORGANIZATION_A, USER_A, MEMBERSHIP_B, ORGANIZATION_B, USER_B, NOW],
  );
  await administrativePool.query(
    `insert into roles (id, organization_id, code, display_name) values
      ($1,$2,'manager','Manager'), ($3,$4,'manager','Manager')`,
    [ROLE_A, ORGANIZATION_A, ROLE_B, ORGANIZATION_B],
  );
  await administrativePool.query(
    `insert into roles
      (id, organization_id, code, display_name, lifecycle_status, is_system_role, disabled_at)
     values ($1,$2,'disabled_manager','Manager','disabled',false,$3)`,
    [DISABLED_ROLE, ORGANIZATION_A, NOW],
  );
  const permission = await administrativePool.query<{ id: string }>(
    "select id from permissions where code = 'organization.read'",
  );
  await administrativePool.query(
    'insert into role_permissions (role_id, permission_id, granted_at) values ($1,$3,$4),($2,$3,$4)',
    [ROLE_A, ROLE_B, permission.rows[0]!.id, NOW],
  );
  await administrativePool.query(
    `insert into membership_role_assignments
      (id, organization_id, membership_id, role_id, assigned_at)
     values ($1,$2,$3,$4,$8), ($5,$6,$7,$9,$8)`,
    [
      ASSIGNMENT_A,
      ORGANIZATION_A,
      MEMBERSHIP_A,
      ROLE_A,
      ASSIGNMENT_B,
      ORGANIZATION_B,
      MEMBERSHIP_B,
      ROLE_B,
      NOW,
    ],
  );
}

beforeAll(async () => {
  administrativePool = await prepareIsolatedTestDatabase(databaseUrl);
  await provisionRuntimeTestRole(administrativePool);
  await seedAuthorizationModel();
  runtimePool = createDatabasePool(
    parseDatabaseRuntimeConfig({
      databaseUrl: createRuntimeTestDatabaseUrl(databaseUrl),
      maxConnections: 1,
      idleTimeoutMs: 1_000,
      connectionTimeoutMs: 5_000,
    }),
  );
  repository = new PostgresAuthorizationRepository(administrativePool);
  service = new OrganizationAuthorizationService(repository, () => NOW);
});

afterAll(async () => {
  await shutdownDatabasePool(runtimePool);
  await dropRuntimeTestRole(administrativePool);
  await resetIsolatedTestDatabase(administrativePool);
  await administrativePool.end();
});

describe('authorization schema and constraints', () => {
  it('applies the forward migration and creates every authorization table', async () => {
    const tables = await administrativePool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name = any($1::text[]) order by table_name`,
      [AUTHORIZATION_TABLES],
    );
    const migrations = await administrativePool.query<{ count: string }>(
      'select count(*) from drizzle.__drizzle_migrations',
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual([...AUTHORIZATION_TABLES]);
    expect(migrations.rows[0]?.count).toBe('4');
  });

  it('seeds the provisional non-wildcard permission vocabulary read-only for runtime', async () => {
    const permissions = await administrativePool.query<{ code: string }>(
      'select code from permissions order by code',
    );
    expect(permissions.rows.map((row) => row.code)).toEqual([
      'membership.manage',
      'membership.read',
      'organization.manage',
      'organization.read',
      'property.manage',
      'property.read',
    ]);
    const client = await runtimePool.connect();
    try {
      await expect(client.query('select code from permissions')).resolves.toMatchObject({
        rowCount: 6,
      });
      await expect(
        client.query(
          "insert into permissions (id, code, display_name) values ($1,'unit.read','Read units')",
          ['01890f47-6c8a-7819-8a21-9b7c1d2e3819'],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      client.release();
    }
  });

  it('enforces UUIDv7, uniqueness, lifecycle, and tenant-aware relationships', async () => {
    await expect(
      administrativePool.query(
        `insert into organization_memberships (id, organization_id, user_id, status, invited_at)
       values ($1,$2,$3,'invited',$4)`,
        [INVALID_UUID, ORGANIZATION_A, USER_WITHOUT_MEMBERSHIP, NOW],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      administrativePool.query(
        `insert into organization_memberships (id, organization_id, user_id, status, invited_at)
       values ('01890f47-6c8a-7820-8a21-9b7c1d2e3820',$1,$2,'invited',$3)`,
        [ORGANIZATION_A, USER_A, NOW],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      administrativePool.query(
        `insert into roles (id, organization_id, code, display_name)
       values ('01890f47-6c8a-7821-8a21-9b7c1d2e3821',$1,'manager','Duplicate')`,
        [ORGANIZATION_A],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      administrativePool.query(
        `insert into permissions (id, code, display_name)
       values ('01890f47-6c8a-7822-8a21-9b7c1d2e3822','organization.read','Duplicate')`,
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      administrativePool.query(
        `insert into membership_role_assignments
       (id, organization_id, membership_id, role_id, assigned_at)
       values ('01890f47-6c8a-7823-8a21-9b7c1d2e3823',$1,$2,$3,$4)`,
        [ORGANIZATION_A, MEMBERSHIP_A, ROLE_B, NOW],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      administrativePool.query(
        `insert into membership_role_assignments
       (id, organization_id, membership_id, role_id, assigned_at)
       values ('01890f47-6c8a-7824-8a21-9b7c1d2e3824',$1,$2,$3,$4)`,
        [ORGANIZATION_A, MEMBERSHIP_A, ROLE_A, NOW],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      administrativePool.query(
        `insert into organization_memberships
       (id, organization_id, user_id, status, invited_at)
       values ($1,$2,$3,'active',$4)`,
        [INVITED_MEMBERSHIP, ORGANIZATION_A, USER_WITHOUT_MEMBERSHIP, NOW],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('authorization decisions and trusted database context', () => {
  it('grants only an active membership with an explicit active permission', async () => {
    const granted = await service.authorize({
      userId: USER_A,
      organizationId: ORGANIZATION_A,
      requiredPermissions: [READ_ORGANIZATION],
    });
    expect(granted.granted).toBe(true);
    await expect(
      service.authorize({
        userId: USER_A,
        organizationId: ORGANIZATION_A,
        requiredPermissions: [MANAGE_ORGANIZATION],
      }),
    ).resolves.toEqual({ granted: false, reason: 'permission_denied' });
    await expect(
      service.authorize({
        userId: USER_WITHOUT_MEMBERSHIP,
        organizationId: ORGANIZATION_A,
        requiredPermissions: [],
      }),
    ).resolves.toEqual({ granted: false, reason: 'membership_not_found' });
  });

  it('denies invited, suspended, and revoked memberships', async () => {
    await administrativePool.query(
      `insert into organization_memberships (id, organization_id, user_id, status, invited_at)
       values ($1,$2,$3,'invited',$4)`,
      [INVITED_MEMBERSHIP, ORGANIZATION_A, USER_WITHOUT_MEMBERSHIP, NOW],
    );
    await expect(
      service.authorize({
        userId: USER_WITHOUT_MEMBERSHIP,
        organizationId: ORGANIZATION_A,
        requiredPermissions: [],
      }),
    ).resolves.toEqual({ granted: false, reason: 'membership_inactive' });
    await administrativePool.query(
      `update organization_memberships set status='suspended', activated_at=$2, suspended_at=$2 where id=$1`,
      [INVITED_MEMBERSHIP, NOW],
    );
    await expect(
      service.authorize({
        userId: USER_WITHOUT_MEMBERSHIP,
        organizationId: ORGANIZATION_A,
        requiredPermissions: [],
      }),
    ).resolves.toEqual({ granted: false, reason: 'membership_inactive' });
    await administrativePool.query(
      `update organization_memberships set status='revoked', revoked_at=$2 where id=$1`,
      [INVITED_MEMBERSHIP, NOW],
    );
    await expect(
      service.authorize({
        userId: USER_WITHOUT_MEMBERSHIP,
        organizationId: ORGANIZATION_A,
        requiredPermissions: [],
      }),
    ).resolves.toEqual({ granted: false, reason: 'membership_inactive' });
  });

  it('denies disabled roles and revoked assignments', async () => {
    const permission = await administrativePool.query<{ id: string }>(
      "select id from permissions where code='organization.read'",
    );
    await administrativePool.query(
      'insert into role_permissions (role_id, permission_id, granted_at) values ($1,$2,$3)',
      [DISABLED_ROLE, permission.rows[0]!.id, NOW],
    );
    await administrativePool.query(
      `insert into membership_role_assignments (id, organization_id, membership_id, role_id, assigned_at)
       values ($1,$2,$3,$4,$5)`,
      [DISABLED_ASSIGNMENT, ORGANIZATION_A, MEMBERSHIP_A, DISABLED_ROLE, NOW],
    );
    await administrativePool.query(
      "update membership_role_assignments set lifecycle_status='revoked', revoked_at=$2 where id=$1",
      [ASSIGNMENT_A, NOW],
    );
    await expect(
      service.authorize({
        userId: USER_A,
        organizationId: ORGANIZATION_A,
        requiredPermissions: [READ_ORGANIZATION],
      }),
    ).resolves.toEqual({ granted: false, reason: 'permission_denied' });
  });

  it('establishes transaction-local context only from a successful decision', async () => {
    await administrativePool.query(
      "update membership_role_assignments set lifecycle_status='active', revoked_at=null where id=$1",
      [ASSIGNMENT_A],
    );
    const decision = await service.authorize({
      userId: USER_A,
      organizationId: ORGANIZATION_A,
      requiredPermissions: [READ_ORGANIZATION],
    });
    expect(decision.granted).toBe(true);
    if (!decision.granted) return;

    await withAuthorizedOrganizationTransaction(
      runtimePool,
      decision.context,
      async ({ client }) => {
        const current = await client.query<{ organization_id: string }>(
          'select habitacores.current_organization_id() as organization_id',
        );
        const own = await client.query<{ id: string }>('select id from properties order by id');
        expect(current.rows[0]?.organization_id).toBe(ORGANIZATION_A);
        expect(own.rows).toEqual([{ id: PROPERTY_A }]);
        expect(own.rows).not.toContainEqual({ id: PROPERTY_B });
      },
    );

    const client = await runtimePool.connect();
    try {
      const cleared = await client.query<{ organization_id: string | null }>(
        "select nullif(current_setting($1, true), '') as organization_id",
        [ORGANIZATION_CONTEXT_SETTING],
      );
      expect(cleared.rows[0]?.organization_id).toBeNull();
    } finally {
      client.release();
    }
  });
});

describe('authorization table RLS', () => {
  it('enables FORCE RLS and separate CRUD policies with role-derived semantics', async () => {
    const relations = await administrativePool.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c
       join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname=any($1::text[])`,
      [RLS_TABLES],
    );
    expect(relations.rows).toHaveLength(4);
    expect(relations.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    const policies = await administrativePool.query<{
      table_name: string;
      policy_name: string;
      using_expression: string | null;
      check_expression: string | null;
    }>(
      `select c.relname table_name, p.polname policy_name,
        pg_get_expr(p.polqual,p.polrelid) using_expression,
        pg_get_expr(p.polwithcheck,p.polrelid) check_expression
       from pg_policy p join pg_class c on c.oid=p.polrelid
       where c.relname=any($1::text[])`,
      [RLS_TABLES],
    );
    expect(policies.rows).toHaveLength(16);
    const rolePolicies = policies.rows.filter((row) => row.table_name === 'role_permissions');
    expect(
      rolePolicies.every((row) =>
        `${row.using_expression} ${row.check_expression}`.includes('current_organization_id'),
      ),
    ).toBe(true);
  });

  it('fails closed without context and isolates organization rows and mutations', async () => {
    const client = await runtimePool.connect();
    try {
      for (const table of RLS_TABLES) {
        const hidden = await client.query<{ count: string }>(`select count(*) from ${table}`);
        expect(hidden.rows[0]?.count).toBe('0');
      }
    } finally {
      client.release();
    }

    await withTransaction(runtimePool, async (transaction) => {
      await setTransactionOrganizationContext(transaction, ORGANIZATION_A);
      for (const table of ['organization_memberships', 'roles', 'membership_role_assignments']) {
        const rows = await transaction.client.query<{ organization_id: string }>(
          `select organization_id from ${table}`,
        );
        expect(rows.rows.every((row) => row.organization_id === ORGANIZATION_A)).toBe(true);
      }
      await expect(
        transaction.client.query("update roles set display_name='crossing' where id=$1", [ROLE_B]),
      ).resolves.toMatchObject({ rowCount: 0 });
    });
  });

  it('keeps the runtime role non-owner, non-superuser, and NOBYPASSRLS', async () => {
    const role = await administrativePool.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      'select rolsuper, rolbypassrls from pg_roles where rolname=$1',
      [RUNTIME_TEST_ROLE],
    );
    expect(role.rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
    const owners = await administrativePool.query<{ count: string }>(
      `select count(*) from pg_class c join pg_roles r on r.oid=c.relowner
       where c.relname=any($1::text[]) and r.rolname=$2`,
      [AUTHORIZATION_TABLES, RUNTIME_TEST_ROLE],
    );
    expect(owners.rows[0]?.count).toBe('0');
    const permissionGrants = await administrativePool.query<{ privilege_type: string }>(
      `select privilege_type from information_schema.role_table_grants
       where grantee=$1 and table_name='permissions' order by privilege_type`,
      [RUNTIME_TEST_ROLE],
    );
    expect(permissionGrants.rows).toEqual([{ privilege_type: 'SELECT' }]);
  });
});

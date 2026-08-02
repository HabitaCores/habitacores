import type { Pool, PoolClient } from 'pg';
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

const TABLES = [
  'organizations',
  'properties',
  'communities',
  'buildings',
  'blocks',
  'floors',
  'units',
] as const;
const OPERATIONS = [
  { name: 'select', command: 'r', using: true, check: false },
  { name: 'insert', command: 'a', using: false, check: true },
  { name: 'update', command: 'w', using: true, check: true },
  { name: 'delete', command: 'd', using: true, check: false },
] as const;

const ORGANIZATION_A = '01890f47-6c8a-7001-8a21-9b7c1d2e3001';
const PROPERTY_A = '01890f47-6c8a-7002-8a21-9b7c1d2e3002';
const COMMUNITY_A = '01890f47-6c8a-7003-8a21-9b7c1d2e3003';
const BUILDING_A = '01890f47-6c8a-7004-8a21-9b7c1d2e3004';
const BLOCK_A = '01890f47-6c8a-7005-8a21-9b7c1d2e3005';
const FLOOR_A = '01890f47-6c8a-7006-8a21-9b7c1d2e3006';
const UNIT_A = '01890f47-6c8a-7007-8a21-9b7c1d2e3007';

const ORGANIZATION_B = '01890f47-6c8a-7101-8a21-9b7c1d2e3101';
const PROPERTY_B = '01890f47-6c8a-7102-8a21-9b7c1d2e3102';
const COMMUNITY_B = '01890f47-6c8a-7103-8a21-9b7c1d2e3103';
const BUILDING_B = '01890f47-6c8a-7104-8a21-9b7c1d2e3104';
const BLOCK_B = '01890f47-6c8a-7105-8a21-9b7c1d2e3105';
const FLOOR_B = '01890f47-6c8a-7106-8a21-9b7c1d2e3106';
const UNIT_B = '01890f47-6c8a-7107-8a21-9b7c1d2e3107';

const INSERT_UNIT_A = '01890f47-6c8a-7201-8a21-9b7c1d2e3201';
const CROSS_TENANT_UNIT = '01890f47-6c8a-7202-8a21-9b7c1d2e3202';
const INVALID_PARENT_UNIT = '01890f47-6c8a-7203-8a21-9b7c1d2e3203';
const DELETE_UNIT_A = '01890f47-6c8a-7204-8a21-9b7c1d2e3204';
const UNAUTHORIZED_ORGANIZATION = '01890f47-6c8a-7205-8a21-9b7c1d2e3205';

const HIERARCHY_ROWS = [
  { table: 'organizations', organizationAId: ORGANIZATION_A, organizationBId: ORGANIZATION_B },
  { table: 'properties', organizationAId: PROPERTY_A, organizationBId: PROPERTY_B },
  { table: 'communities', organizationAId: COMMUNITY_A, organizationBId: COMMUNITY_B },
  { table: 'buildings', organizationAId: BUILDING_A, organizationBId: BUILDING_B },
  { table: 'blocks', organizationAId: BLOCK_A, organizationBId: BLOCK_B },
  { table: 'floors', organizationAId: FLOOR_A, organizationBId: FLOOR_B },
  { table: 'units', organizationAId: UNIT_A, organizationBId: UNIT_B },
] as const;

const databaseUrl = readIsolatedTestDatabaseUrl(process.env);
let administrativePool: Pool;
let runtimePool: DatabasePool;
let quotedAdministrativeRole: string;

async function seedHierarchy(pool: Pool): Promise<void> {
  await pool.query('insert into organizations (id) values ($1), ($2)', [
    ORGANIZATION_A,
    ORGANIZATION_B,
  ]);
  await pool.query('insert into properties (id, organization_id) values ($1, $2), ($3, $4)', [
    PROPERTY_A,
    ORGANIZATION_A,
    PROPERTY_B,
    ORGANIZATION_B,
  ]);
  await pool.query(
    `insert into communities (id, organization_id, property_id)
     values ($1, $2, $3), ($4, $5, $6)`,
    [COMMUNITY_A, ORGANIZATION_A, PROPERTY_A, COMMUNITY_B, ORGANIZATION_B, PROPERTY_B],
  );
  await pool.query(
    `insert into buildings (id, organization_id, community_id)
     values ($1, $2, $3), ($4, $5, $6)`,
    [BUILDING_A, ORGANIZATION_A, COMMUNITY_A, BUILDING_B, ORGANIZATION_B, COMMUNITY_B],
  );
  await pool.query(
    `insert into blocks (id, organization_id, building_id)
     values ($1, $2, $3), ($4, $5, $6)`,
    [BLOCK_A, ORGANIZATION_A, BUILDING_A, BLOCK_B, ORGANIZATION_B, BUILDING_B],
  );
  await pool.query(
    'insert into floors (id, organization_id, block_id) values ($1, $2, $3), ($4, $5, $6)',
    [FLOOR_A, ORGANIZATION_A, BLOCK_A, FLOOR_B, ORGANIZATION_B, BLOCK_B],
  );
  await pool.query(
    'insert into units (id, organization_id, floor_id) values ($1, $2, $3), ($4, $5, $6)',
    [UNIT_A, ORGANIZATION_A, FLOOR_A, UNIT_B, ORGANIZATION_B, FLOOR_B],
  );
}

async function withOrganizationContext<Result>(
  organizationId: string,
  callback: (client: PoolClient) => Promise<Result>,
): Promise<Result> {
  return withTransaction(runtimePool, async (transaction) => {
    await setTransactionOrganizationContext(transaction, organizationId);
    return callback(transaction.client);
  });
}

beforeAll(async () => {
  administrativePool = await prepareIsolatedTestDatabase(databaseUrl);
  await provisionRuntimeTestRole(administrativePool);
  await seedHierarchy(administrativePool);

  const administrativeIdentity = await administrativePool.query<{ quoted_role_name: string }>(
    'select quote_ident(current_user) as quoted_role_name',
  );
  quotedAdministrativeRole = administrativeIdentity.rows[0]?.quoted_role_name ?? '';

  runtimePool = createDatabasePool(
    parseDatabaseRuntimeConfig({
      databaseUrl: createRuntimeTestDatabaseUrl(databaseUrl),
      maxConnections: 1,
      idleTimeoutMs: 1_000,
      connectionTimeoutMs: 5_000,
    }),
  );
});

afterAll(async () => {
  await shutdownDatabasePool(runtimePool);
  await dropRuntimeTestRole(administrativePool);
  await resetIsolatedTestDatabase(administrativePool);
  await administrativePool.end();
});

describe('PostgreSQL organization row-level security', () => {
  it('enables and forces RLS and installs every operation-specific policy', async () => {
    const relations = await administrativePool.query<{
      relforcerowsecurity: boolean;
      relname: string;
      relrowsecurity: boolean;
    }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = any($1::text[])
       order by c.relname`,
      [TABLES],
    );

    expect(relations.rows).toHaveLength(TABLES.length);
    expect(relations.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);

    const policies = await administrativePool.query<{
      check_expression: string | null;
      command: string;
      policy_name: string;
      table_name: string;
      using_expression: string | null;
    }>(
      `select c.relname as table_name,
              p.polname as policy_name,
              p.polcmd as command,
              pg_catalog.pg_get_expr(p.polqual, p.polrelid) as using_expression,
              pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) as check_expression
       from pg_catalog.pg_policy p
       join pg_catalog.pg_class c on c.oid = p.polrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = any($1::text[])
       order by c.relname, p.polname`,
      [TABLES],
    );

    expect(policies.rows).toHaveLength(TABLES.length * OPERATIONS.length);

    for (const table of TABLES) {
      const tenantColumn = table === 'organizations' ? 'id' : 'organization_id';
      const expectedExpression = `(${tenantColumn} = habitacores.current_organization_id())`;

      for (const operation of OPERATIONS) {
        const policy = policies.rows.find(
          (row) =>
            row.table_name === table &&
            row.policy_name === `${table}_organization_${operation.name}`,
        );

        expect(policy?.command).toBe(operation.command);

        if (operation.using) {
          expect(policy?.using_expression).toBe(expectedExpression);
        } else {
          expect(policy?.using_expression).toBeNull();
        }

        if (operation.check) {
          expect(policy?.check_expression).toBe(expectedExpression);
        } else {
          expect(policy?.check_expression).toBeNull();
        }
      }
    }
  });

  it('separates administrative ownership from least-privilege runtime access', async () => {
    const role = await administrativePool.query<{
      rolbypassrls: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolinherit: boolean;
      rolreplication: boolean;
      rolsuper: boolean;
    }>(
      `select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit, rolreplication
       from pg_catalog.pg_roles
       where rolname = $1`,
      [RUNTIME_TEST_ROLE],
    );

    expect(role.rows).toEqual([
      {
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolinherit: false,
        rolreplication: false,
        rolsuper: false,
      },
    ]);

    const owners = await administrativePool.query<{ owner_name: string; table_name: string }>(
      `select c.relname as table_name, r.rolname as owner_name
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       join pg_catalog.pg_roles r on r.oid = c.relowner
       where n.nspname = 'public' and c.relname = any($1::text[])`,
      [TABLES],
    );
    expect(owners.rows).toHaveLength(TABLES.length);
    expect(owners.rows.every(({ owner_name }) => owner_name !== RUNTIME_TEST_ROLE)).toBe(true);

    const helper = await administrativePool.query<{ owner_name: string }>(
      `select r.rolname as owner_name
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       join pg_catalog.pg_roles r on r.oid = p.proowner
       where n.nspname = 'habitacores' and p.proname = 'current_organization_id'`,
    );
    expect(helper.rows).toHaveLength(1);
    expect(helper.rows[0]?.owner_name).not.toBe(RUNTIME_TEST_ROLE);

    const publicFunctionGrants = await administrativePool.query<{ count: string }>(
      `select count(*)
       from information_schema.routine_privileges
       where specific_schema = 'habitacores'
         and routine_name = 'current_organization_id'
         and grantee = 'PUBLIC'`,
    );
    expect(publicFunctionGrants.rows[0]?.count).toBe('0');

    const runtimeFunctionPrivilege = await administrativePool.query<{ permitted: boolean }>(
      `select has_function_privilege($1, 'habitacores.current_organization_id()', 'EXECUTE')
         as permitted`,
      [RUNTIME_TEST_ROLE],
    );
    expect(runtimeFunctionPrivilege.rows[0]?.permitted).toBe(true);

    const grants = await administrativePool.query<{ privilege_type: string; table_name: string }>(
      `select table_name, privilege_type
       from information_schema.role_table_grants
       where grantee = $1 and table_schema = 'public'
       order by table_name, privilege_type`,
      [RUNTIME_TEST_ROLE],
    );
    expect(grants.rows).toHaveLength(TABLES.length * 4);
    expect(new Set(grants.rows.map(({ privilege_type }) => privilege_type))).toEqual(
      new Set(['DELETE', 'INSERT', 'SELECT', 'UPDATE']),
    );

    const client = await runtimePool.connect();

    try {
      const identity = await client.query<{ current_user: string; session_user: string }>(
        'select current_user, session_user',
      );
      expect(identity.rows).toEqual([
        { current_user: RUNTIME_TEST_ROLE, session_user: RUNTIME_TEST_ROLE },
      ]);

      await expect(
        client.query('alter table public.organizations disable row level security'),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(client.query(`set role ${quotedAdministrativeRole}`)).rejects.toMatchObject({
        code: '42501',
      });
      await expect(
        client.query(`set session authorization ${quotedAdministrativeRole}`),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(client.query('set session_replication_role = replica')).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      client.release();
    }

    await expect(
      withTransaction(runtimePool, async ({ client: transactionClient }) => {
        await transactionClient.query('set local row_security = off');
        await transactionClient.query('select id from organizations');
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('fails closed without context for every protected table and write operation', async () => {
    const client = await runtimePool.connect();

    try {
      for (const table of TABLES) {
        const rows = await client.query<{ count: string }>(`select count(*) from ${table}`);
        expect(rows.rows[0]?.count).toBe('0');
      }

      await expect(
        client.query('insert into organizations (id) values ($1)', [UNAUTHORIZED_ORGANIZATION]),
      ).rejects.toMatchObject({ code: '42501' });

      const updated = await client.query('update units set updated_at = updated_at where id = $1', [
        UNIT_A,
      ]);
      const deleted = await client.query('delete from units where id = $1', [UNIT_A]);
      expect(updated.rowCount).toBe(0);
      expect(deleted.rowCount).toBe(0);
    } finally {
      client.release();
    }
  });

  it('keeps valid context transaction-local and rejects malformed context', async () => {
    await withOrganizationContext(ORGANIZATION_A, async (client) => {
      const current = await client.query<{ organization_id: string | null }>(
        'select habitacores.current_organization_id() as organization_id',
      );
      const visible = await client.query<{ count: string }>('select count(*) from organizations');
      expect(current.rows[0]?.organization_id).toBe(ORGANIZATION_A);
      expect(visible.rows[0]?.count).toBe('1');
    });

    const afterCommit = await runtimePool.connect();

    try {
      const current = await afterCommit.query<{ organization_id: string | null }>(
        'select habitacores.current_organization_id() as organization_id',
      );
      expect(current.rows[0]?.organization_id).toBeNull();
    } finally {
      afterCommit.release();
    }

    await expect(
      withOrganizationContext(ORGANIZATION_B, async (client) => {
        const current = await client.query<{ organization_id: string | null }>(
          'select habitacores.current_organization_id() as organization_id',
        );
        expect(current.rows[0]?.organization_id).toBe(ORGANIZATION_B);
        throw new Error('verify rollback cleanup');
      }),
    ).rejects.toThrow('verify rollback cleanup');

    const afterRollback = await runtimePool.connect();

    try {
      const current = await afterRollback.query<{ organization_id: string | null }>(
        'select habitacores.current_organization_id() as organization_id',
      );
      expect(current.rows[0]?.organization_id).toBeNull();
    } finally {
      afterRollback.release();
    }

    await expect(
      withTransaction(runtimePool, async ({ client }) => {
        await client.query('select set_config($1, $2, true)', [
          ORGANIZATION_CONTEXT_SETTING,
          'malformed-context',
        ]);
        await client.query('select id from organizations');
      }),
    ).rejects.toMatchObject({ code: '22P02' });
  });

  it('isolates reads table by table across two complete hierarchies', async () => {
    await withOrganizationContext(ORGANIZATION_A, async (client) => {
      for (const row of HIERARCHY_ROWS) {
        const visible = await client.query<{ id: string }>(
          `select id::text from ${row.table} order by id`,
        );
        expect(visible.rows).toEqual([{ id: row.organizationAId }]);
        expect(visible.rows).not.toContainEqual({ id: row.organizationBId });
      }
    });
  });

  it('allows same-tenant inserts while RLS and composite foreign keys reject crossings', async () => {
    await withOrganizationContext(ORGANIZATION_A, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `insert into units (id, organization_id, floor_id)
         values ($1, $2, $3)
         returning id::text`,
        [INSERT_UNIT_A, ORGANIZATION_A, FLOOR_A],
      );
      expect(inserted.rows).toEqual([{ id: INSERT_UNIT_A }]);
    });

    await expect(
      withOrganizationContext(ORGANIZATION_A, async (client) => {
        await client.query(
          'insert into units (id, organization_id, floor_id) values ($1, $2, $3)',
          [CROSS_TENANT_UNIT, ORGANIZATION_B, FLOOR_B],
        );
      }),
    ).rejects.toMatchObject({ code: '42501' });

    await expect(
      withOrganizationContext(ORGANIZATION_A, async (client) => {
        await client.query('insert into organizations (id) values ($1)', [
          UNAUTHORIZED_ORGANIZATION,
        ]);
      }),
    ).rejects.toMatchObject({ code: '42501' });

    await expect(
      withOrganizationContext(ORGANIZATION_A, async (client) => {
        await client.query(
          'insert into units (id, organization_id, floor_id) values ($1, $2, $3)',
          [INVALID_PARENT_UNIT, ORGANIZATION_A, FLOOR_B],
        );
      }),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('allows same-tenant updates without exposing or reassigning cross-tenant rows', async () => {
    await withOrganizationContext(ORGANIZATION_A, async (client) => {
      const own = await client.query<{ id: string }>(
        `update units
         set updated_at = updated_at + interval '1 second'
         where id = $1
         returning id::text`,
        [UNIT_A],
      );
      const other = await client.query<{ id: string }>(
        `update units
         set updated_at = updated_at + interval '1 second'
         where id = $1
         returning id::text`,
        [UNIT_B],
      );
      expect(own.rows).toEqual([{ id: UNIT_A }]);
      expect(other.rows).toEqual([]);
      expect(other.rowCount).toBe(0);
    });

    await expect(
      withOrganizationContext(ORGANIZATION_A, async (client) => {
        await client.query(
          `update units
           set organization_id = $1, floor_id = $2
           where id = $3`,
          [ORGANIZATION_B, FLOOR_B, INSERT_UNIT_A],
        );
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('allows same-tenant deletes and hides cross-tenant delete targets', async () => {
    await withOrganizationContext(ORGANIZATION_A, async (client) => {
      await client.query('insert into units (id, organization_id, floor_id) values ($1, $2, $3)', [
        DELETE_UNIT_A,
        ORGANIZATION_A,
        FLOOR_A,
      ]);
      const own = await client.query<{ id: string }>(
        'delete from units where id = $1 returning id::text',
        [DELETE_UNIT_A],
      );
      const other = await client.query<{ id: string }>(
        'delete from units where id = $1 returning id::text',
        [UNIT_B],
      );
      expect(own.rows).toEqual([{ id: DELETE_UNIT_A }]);
      expect(other.rows).toEqual([]);
      expect(other.rowCount).toBe(0);
    });
  });
});

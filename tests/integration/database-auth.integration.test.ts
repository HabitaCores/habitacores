import {
  AuthenticationError,
  createUuidV7IdentityIdGenerator,
  createVerifiedProviderIdentity,
  IdentityLinkError,
  IdentityResolutionService,
  PostgresIdentityRepository,
  type ExternalIdentityLink,
  type HabitacoresUser,
} from '../../packages/auth/src/index.js';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseDatabaseRuntimeConfig } from '../../packages/database/src/runtime/config.js';
import {
  createDatabasePool,
  shutdownDatabasePool,
  type DatabasePool,
} from '../../packages/database/src/runtime/pool.js';
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

const IDENTITY_TABLES = ['external_identity_links', 'users'] as const;
const VALID_USER_ID = '01890f47-6c8a-7401-8a21-9b7c1d2e3401';
const VALID_LINK_ID = '01890f47-6c8a-7402-8a21-9b7c1d2e3402';
const SECOND_LINK_ID = '01890f47-6c8a-7403-8a21-9b7c1d2e3403';
const DUPLICATE_LINK_ID = '01890f47-6c8a-7404-8a21-9b7c1d2e3404';
const INVALID_LINK_ID = '550e8400-e29b-41d4-a716-446655440000';
const INVALID_USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const OBSERVED_AT = new Date('2026-01-01T00:00:00.000Z');
const LIFECYCLE_AT = new Date('2026-01-02T00:00:00.000Z');

const databaseUrl = readIsolatedTestDatabaseUrl(process.env);
let administrativePool: Pool;
let runtimePool: DatabasePool;
let repository: PostgresIdentityRepository;

function verifiedIdentity(subject: string) {
  return createVerifiedProviderIdentity({
    provider: 'supabase',
    subject,
    providerEmail: 'observation@example.invalid',
    providerPhone: '+15550000000',
    emailVerified: true,
    phoneVerified: false,
    authenticationMethod: 'password',
    assurance: { level: 'aal1', methods: ['password'] },
    authenticatedAt: OBSERVED_AT,
  });
}

function identityRecords(
  subject: string,
  userId = createUuidV7IdentityIdGenerator().createUserId(),
  linkId = createUuidV7IdentityIdGenerator().createIdentityLinkId(),
): { user: HabitacoresUser; identityLink: ExternalIdentityLink } {
  const identity = verifiedIdentity(subject);
  const user: HabitacoresUser = {
    id: userId,
    lifecycleStatus: 'active',
    displayName: null,
    preferredEmail: null,
    preferredPhone: null,
    createdAt: OBSERVED_AT,
    updatedAt: OBSERVED_AT,
    suspendedAt: null,
    disabledAt: null,
  };

  return {
    user,
    identityLink: {
      id: linkId,
      userId,
      provider: identity.provider,
      providerSubject: identity.subject,
      providerEmail: identity.providerEmail,
      providerPhone: identity.providerPhone,
      emailVerified: identity.emailVerified,
      phoneVerified: identity.phoneVerified,
      authenticationMethod: identity.authenticationMethod,
      firstSeenAt: OBSERVED_AT,
      lastSeenAt: OBSERVED_AT,
      createdAt: OBSERVED_AT,
      updatedAt: OBSERVED_AT,
    },
  };
}

beforeAll(async () => {
  administrativePool = await prepareIsolatedTestDatabase(databaseUrl);
  await provisionRuntimeTestRole(administrativePool);
  runtimePool = createDatabasePool(
    parseDatabaseRuntimeConfig({
      databaseUrl: createRuntimeTestDatabaseUrl(databaseUrl),
      maxConnections: 4,
      idleTimeoutMs: 1_000,
      connectionTimeoutMs: 5_000,
    }),
  );
  repository = new PostgresIdentityRepository(runtimePool);
});

afterAll(async () => {
  await shutdownDatabasePool(runtimePool);
  await dropRuntimeTestRole(administrativePool);
  await resetIsolatedTestDatabase(administrativePool);
  await administrativePool.end();
});

describe('authentication identity database model', () => {
  it('applies the forward migration and creates both global identity tables', async () => {
    const tables = await administrativePool.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = 'public' and table_name = any($1::text[])
       order by table_name`,
      [IDENTITY_TABLES],
    );
    const migrations = await administrativePool.query<{ count: string }>(
      'select count(*) from drizzle.__drizzle_migrations',
    );

    expect(tables.rows.map(({ table_name }) => table_name)).toEqual([...IDENTITY_TABLES]);
    expect(migrations.rows[0]?.count).toBe('5');
  });

  it('accepts UUIDv7 records and rejects invalid UUID versions and enum values', async () => {
    await administrativePool.query('insert into users (id) values ($1)', [VALID_USER_ID]);
    await administrativePool.query(
      `insert into external_identity_links (
         id, user_id, provider, provider_subject, provider_email, first_seen_at, last_seen_at
       ) values ($1, $2, 'supabase', $3, $4, $5, $5)`,
      [
        VALID_LINK_ID,
        VALID_USER_ID,
        'opaque-primary-subject',
        'shared@example.invalid',
        OBSERVED_AT,
      ],
    );

    await expect(
      administrativePool.query('insert into users (id) values ($1)', [INVALID_USER_ID]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      administrativePool.query(
        `insert into external_identity_links (
           id, user_id, provider, provider_subject, first_seen_at, last_seen_at
         ) values ($1, $2, 'unsupported', $3, $4, $4)`,
        [
          createUuidV7IdentityIdGenerator().createIdentityLinkId(),
          VALID_USER_ID,
          'opaque-unsupported-provider',
          OBSERVED_AT,
        ],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      administrativePool.query(
        `insert into external_identity_links (
           id, user_id, provider, provider_subject, first_seen_at, last_seen_at
         ) values ($1, $2, 'supabase', $3, $4, $4)`,
        [INVALID_LINK_ID, VALID_USER_ID, 'opaque-invalid-link-id', OBSERVED_AT],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      administrativePool.query("insert into users (id, lifecycle_status) values ($1, 'unknown')", [
        createUuidV7IdentityIdGenerator().createUserId(),
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('enforces provider-subject uniqueness while allowing multiple links per user', async () => {
    await administrativePool.query(
      `insert into external_identity_links (
         id, user_id, provider, provider_subject, provider_email, first_seen_at, last_seen_at
       ) values ($1, $2, 'supabase', $3, $4, $5, $5)`,
      [
        SECOND_LINK_ID,
        VALID_USER_ID,
        'opaque-secondary-subject',
        'shared@example.invalid',
        OBSERVED_AT,
      ],
    );

    await expect(
      administrativePool.query(
        `insert into external_identity_links (
           id, user_id, provider, provider_subject, first_seen_at, last_seen_at
         ) values ($1, $2, 'supabase', $3, $4, $4)`,
        [DUPLICATE_LINK_ID, VALID_USER_ID, 'opaque-primary-subject', OBSERVED_AT],
      ),
    ).rejects.toMatchObject({ code: '23505' });

    const links = await administrativePool.query<{ count: string }>(
      'select count(*) from external_identity_links where user_id = $1',
      [VALID_USER_ID],
    );
    expect(links.rows[0]?.count).toBe('2');
  });

  it('converges concurrent provider-subject creation on one user and link', async () => {
    const service = new IdentityResolutionService(repository, createUuidV7IdentityIdGenerator());
    const identity = verifiedIdentity('opaque-concurrent-subject');
    const results = await Promise.all([service.resolve(identity), service.resolve(identity)]);

    expect(new Set(results.map(({ user }) => user.id))).toHaveLength(1);
    expect(results.map(({ identityLinkCreated }) => identityLinkCreated).sort()).toEqual([
      false,
      true,
    ]);

    const persisted = await administrativePool.query<{ links: string; users: string }>(
      `select
         (select count(*) from external_identity_links
          where provider = 'supabase' and provider_subject = $1) as links,
         (select count(distinct user_id) from external_identity_links
          where provider = 'supabase' and provider_subject = $1) as users`,
      [identity.subject],
    );
    expect(persisted.rows).toEqual([{ links: '1', users: '1' }]);
  });

  it('rolls back user creation when identity-link creation conflicts', async () => {
    const attemptedUserId = createUuidV7IdentityIdGenerator().createUserId();
    const records = identityRecords(
      'opaque-primary-subject',
      attemptedUserId,
      createUuidV7IdentityIdGenerator().createIdentityLinkId(),
    );

    await expect(repository.createUserWithIdentityLink(records)).rejects.toEqual(
      new IdentityLinkError('IDENTITY_CONFLICT'),
    );

    const user = await administrativePool.query<{ count: string }>(
      'select count(*) from users where id = $1',
      [attemptedUserId],
    );
    expect(user.rows[0]?.count).toBe('0');
  });

  it('persists lifecycle states and rejects suspended and disabled users', async () => {
    const service = new IdentityResolutionService(repository, createUuidV7IdentityIdGenerator());
    const suspendedIdentity = verifiedIdentity('opaque-suspended-subject');
    const disabledIdentity = verifiedIdentity('opaque-disabled-subject');
    const suspended = await service.resolve(suspendedIdentity);
    const disabled = await service.resolve(disabledIdentity);

    await repository.suspendUser(suspended.user.id, LIFECYCLE_AT);
    await repository.disableUser(disabled.user.id, LIFECYCLE_AT);

    await expect(service.resolve(suspendedIdentity)).rejects.toEqual(
      new AuthenticationError('SUSPENDED_USER'),
    );
    await expect(service.resolve(disabledIdentity)).rejects.toEqual(
      new AuthenticationError('DISABLED_USER'),
    );

    const states = await administrativePool.query<{
      disabled_at: Date | null;
      lifecycle_status: string;
      suspended_at: Date | null;
    }>(
      `select lifecycle_status, suspended_at, disabled_at
       from users
       where id = any($1::uuid[])
       order by lifecycle_status`,
      [[suspended.user.id, disabled.user.id]],
    );
    expect(states.rows).toEqual([
      { lifecycle_status: 'disabled', suspended_at: null, disabled_at: LIFECYCLE_AT },
      { lifecycle_status: 'suspended', suspended_at: LIFECYCLE_AT, disabled_at: null },
    ]);
  });

  it('keeps global identity tables non-RLS and server-runtime privileged only', async () => {
    const relations = await administrativePool.query<{
      owner_name: string;
      relforcerowsecurity: boolean;
      relname: string;
      relrowsecurity: boolean;
    }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity, r.rolname as owner_name
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       join pg_catalog.pg_roles r on r.oid = c.relowner
       where n.nspname = 'public' and c.relname = any($1::text[])
       order by c.relname`,
      [IDENTITY_TABLES],
    );
    expect(relations.rows).toHaveLength(2);
    expect(
      relations.rows.every(
        (row) =>
          !row.relrowsecurity && !row.relforcerowsecurity && row.owner_name !== RUNTIME_TEST_ROLE,
      ),
    ).toBe(true);

    const runtimeGrants = await administrativePool.query<{
      privilege_type: string;
      table_name: string;
    }>(
      `select table_name, privilege_type
       from information_schema.role_table_grants
       where grantee = $1
         and table_schema = 'public'
         and table_name = any($2::text[])
       order by table_name, privilege_type`,
      [RUNTIME_TEST_ROLE, IDENTITY_TABLES],
    );
    expect(runtimeGrants.rows).toHaveLength(8);
    expect(new Set(runtimeGrants.rows.map(({ privilege_type }) => privilege_type))).toEqual(
      new Set(['DELETE', 'INSERT', 'SELECT', 'UPDATE']),
    );

    const publicGrants = await administrativePool.query<{ count: string }>(
      `select count(*)
       from information_schema.role_table_grants
       where grantee = 'PUBLIC'
         and table_schema = 'public'
         and table_name = any($1::text[])`,
      [IDENTITY_TABLES],
    );
    expect(publicGrants.rows[0]?.count).toBe('0');
  });

  it('contains no credential-bearing identity columns', async () => {
    const forbiddenColumns = [
      'password',
      'password_hash',
      'access_token',
      'refresh_token',
      'mfa_secret',
      'service_role_key',
      'anon_key',
    ];
    const columns = await administrativePool.query<{ column_name: string }>(
      `select column_name
       from information_schema.columns
       where table_schema = 'public'
         and table_name = any($1::text[])
         and column_name = any($2::text[])`,
      [IDENTITY_TABLES, forbiddenColumns],
    );

    expect(columns.rows).toEqual([]);
  });
});

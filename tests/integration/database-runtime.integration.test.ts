import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseDatabaseRuntimeConfig } from '../../packages/database/src/runtime/config.js';
import {
  createDatabasePool,
  shutdownDatabasePool,
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

const EXPECTED_TABLES = [
  'blocks',
  'buildings',
  'communities',
  'external_identity_links',
  'floors',
  'organizations',
  'properties',
  'units',
  'users',
];
const VALID_ORGANIZATION_ID = '01890f47-6c8a-7c3d-8a21-9b7c1d2e3f40';
const SECOND_ORGANIZATION_ID = '01890f47-6c8a-7c3d-8a21-9b7c1d2e3f41';
const PROPERTY_ID = '01890f47-6c8a-7c3d-8a21-9b7c1d2e3f42';
const COMMUNITY_ID = '01890f47-6c8a-7c3d-8a21-9b7c1d2e3f43';
const COMMITTED_ORGANIZATION_ID = '01890f47-6c8a-7c3d-8a21-9b7c1d2e3f44';
const ROLLED_BACK_ORGANIZATION_ID = '01890f47-6c8a-7c3d-8a21-9b7c1d2e3f45';
const INVALID_UUID_VERSION = '550e8400-e29b-41d4-a716-446655440000';

const databaseUrl = readIsolatedTestDatabaseUrl(process.env);
let verificationPool: Pool;
let runtimePool: ReturnType<typeof createDatabasePool>;

beforeAll(async () => {
  verificationPool = await prepareIsolatedTestDatabase(databaseUrl);
  runtimePool = createDatabasePool(
    parseDatabaseRuntimeConfig({
      databaseUrl,
      maxConnections: 1,
      idleTimeoutMs: 1_000,
      connectionTimeoutMs: 5_000,
    }),
  );
});

afterAll(async () => {
  await shutdownDatabasePool(runtimePool);
  await resetIsolatedTestDatabase(verificationPool);
  await verificationPool.end();
});

describe('database runtime integration foundation', () => {
  it('applies the committed migration on PostgreSQL 18 and creates all hierarchy tables', async () => {
    const version = await verificationPool.query<{ server_version: string }>('show server_version');
    const tables = await verificationPool.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = 'public'
       order by table_name`,
    );
    const migrations = await verificationPool.query<{ count: string }>(
      'select count(*) from drizzle.__drizzle_migrations',
    );

    expect(version.rows[0]?.server_version).toMatch(/^18\./);
    expect(tables.rows.map(({ table_name }) => table_name)).toEqual(EXPECTED_TABLES);
    expect(Number(migrations.rows[0]?.count)).toBeGreaterThan(0);
  });

  it('accepts a valid UUIDv7 organization and rejects other UUID versions', async () => {
    await verificationPool.query('insert into organizations (id) values ($1)', [
      VALID_ORGANIZATION_ID,
    ]);

    await expect(
      verificationPool.query('insert into organizations (id) values ($1)', [INVALID_UUID_VERSION]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('prevents tenant-crossing composite parent references', async () => {
    await verificationPool.query('insert into organizations (id) values ($1)', [
      SECOND_ORGANIZATION_ID,
    ]);
    await verificationPool.query('insert into properties (id, organization_id) values ($1, $2)', [
      PROPERTY_ID,
      VALID_ORGANIZATION_ID,
    ]);

    await expect(
      verificationPool.query(
        'insert into communities (id, organization_id, property_id) values ($1, $2, $3)',
        [COMMUNITY_ID, SECOND_ORGANIZATION_ID, PROPERTY_ID],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('commits successful work and rolls back failed work', async () => {
    await withTransaction(runtimePool, async ({ client }) => {
      await client.query('insert into organizations (id) values ($1)', [COMMITTED_ORGANIZATION_ID]);
    });

    await expect(
      withTransaction(runtimePool, async ({ client }) => {
        await client.query('insert into organizations (id) values ($1)', [
          ROLLED_BACK_ORGANIZATION_ID,
        ]);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    const persisted = await verificationPool.query<{ id: string }>(
      'select id from organizations where id = any($1::uuid[]) order by id',
      [[COMMITTED_ORGANIZATION_ID, ROLLED_BACK_ORGANIZATION_ID]],
    );

    expect(persisted.rows).toEqual([{ id: COMMITTED_ORGANIZATION_ID }]);
  });

  it('keeps organization context transaction-local across pooled connection reuse', async () => {
    await withTransaction(runtimePool, async (transaction) => {
      await setTransactionOrganizationContext(transaction, VALID_ORGANIZATION_ID);

      const inside = await transaction.client.query<{ organization_id: string }>(
        'select current_setting($1, true) as organization_id',
        [ORGANIZATION_CONTEXT_SETTING],
      );

      expect(inside.rows[0]?.organization_id).toBe(VALID_ORGANIZATION_ID);
    });

    const reusedClient = await runtimePool.connect();

    try {
      const outside = await reusedClient.query<{ organization_id: string | null }>(
        "select nullif(current_setting($1, true), '') as organization_id",
        [ORGANIZATION_CONTEXT_SETTING],
      );

      expect(outside.rows[0]?.organization_id).toBeNull();
    } finally {
      reusedClient.release();
    }
  });
});

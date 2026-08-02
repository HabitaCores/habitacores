import { describe, expect, it } from 'vitest';

import { parseDatabaseRuntimeConfig } from './config.js';
import { createDatabasePool, shutdownDatabasePool } from './pool.js';

describe('database pool factory', () => {
  it('creates a pool only when called and exposes credential-free metadata', async () => {
    const secret = 'credential-that-must-not-be-metadata';
    const config = parseDatabaseRuntimeConfig({
      databaseUrl: `postgresql://fake_user:${secret}@127.0.0.1:5432/habitacores_integration_test`,
      maxConnections: 3,
      idleTimeoutMs: 4_000,
      connectionTimeoutMs: 2_000,
    });

    const pool = createDatabasePool(config);

    expect(pool.metadata).toEqual({
      maxConnections: 3,
      idleTimeoutMs: 4_000,
      connectionTimeoutMs: 2_000,
    });
    expect(JSON.stringify(pool.metadata)).not.toContain(secret);

    await shutdownDatabasePool(pool);
  });
});

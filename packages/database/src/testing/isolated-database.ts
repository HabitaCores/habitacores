import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import { createDatabase } from '../runtime/database.js';

const TEST_DATABASE_NAME = 'habitacores_integration_test';
const LOCAL_TEST_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../../../../drizzle/migrations/', import.meta.url),
);

export class IsolatedTestDatabaseConfigurationError extends Error {
  readonly code = 'INVALID_TEST_DATABASE_CONFIGURATION';

  constructor() {
    super('TEST_DATABASE_URL must identify the approved isolated local test database.');
    this.name = 'IsolatedTestDatabaseConfigurationError';
  }
}

export function readIsolatedTestDatabaseUrl(
  environment: Readonly<Record<string, string | undefined>>,
): string {
  const value = environment.TEST_DATABASE_URL;

  if (!value?.trim()) {
    throw new IsolatedTestDatabaseConfigurationError();
  }

  try {
    const url = new URL(value);
    const databaseName = url.pathname.slice(1);

    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !LOCAL_TEST_HOSTS.has(url.hostname) ||
      databaseName !== TEST_DATABASE_NAME
    ) {
      throw new IsolatedTestDatabaseConfigurationError();
    }
  } catch {
    throw new IsolatedTestDatabaseConfigurationError();
  }

  return value;
}

export async function resetIsolatedTestDatabase(pool: Pool): Promise<void> {
  await pool.query('drop schema if exists drizzle cascade');
  await pool.query('drop schema if exists habitacores cascade');
  await pool.query('drop schema if exists public cascade');
  await pool.query('create schema public authorization current_user');
  await pool.query('revoke create on schema public from public');
}

export async function prepareIsolatedTestDatabase(databaseUrl: string): Promise<Pool> {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  });

  try {
    await resetIsolatedTestDatabase(pool);
    await migrate(createDatabase(pool), { migrationsFolder: MIGRATIONS_FOLDER });
    return pool;
  } catch (error) {
    await pool.end();
    throw error;
  }
}

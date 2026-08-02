import { Pool, type PoolClient } from 'pg';

import type { DatabaseRuntimeConfig } from './config.js';
import { DatabaseRuntimeError } from './errors.js';
import { assertServerOnlyRuntime } from './server-only.js';

export interface DatabasePoolMetadata {
  readonly maxConnections: number;
  readonly idleTimeoutMs: number;
  readonly connectionTimeoutMs: number;
}

export interface DatabasePool {
  readonly metadata: DatabasePoolMetadata;
  connect(): Promise<PoolClient>;
  end(): Promise<void>;
}

class NodePostgresDatabasePool implements DatabasePool {
  readonly metadata: DatabasePoolMetadata;
  readonly #pool: Pool;

  constructor(config: DatabaseRuntimeConfig) {
    this.metadata = Object.freeze({
      maxConnections: config.maxConnections,
      idleTimeoutMs: config.idleTimeoutMs,
      connectionTimeoutMs: config.connectionTimeoutMs,
    });
    this.#pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.maxConnections,
      idleTimeoutMillis: config.idleTimeoutMs,
      connectionTimeoutMillis: config.connectionTimeoutMs,
      allowExitOnIdle: true,
    });
  }

  async connect(): Promise<PoolClient> {
    try {
      return await this.#pool.connect();
    } catch {
      throw new DatabaseRuntimeError('Unable to acquire a database connection.');
    }
  }

  async end(): Promise<void> {
    await this.#pool.end();
  }
}

export function createDatabasePool(config: DatabaseRuntimeConfig): DatabasePool {
  assertServerOnlyRuntime();
  return new NodePostgresDatabasePool(config);
}

export async function shutdownDatabasePool(pool: DatabasePool): Promise<void> {
  await pool.end();
}

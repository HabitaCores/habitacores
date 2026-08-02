import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';

import * as schema from '../schema/index.js';
import { assertServerOnlyRuntime } from './server-only.js';

export type Database = NodePgDatabase<typeof schema>;

export function createDatabase(client: Pool | PoolClient): Database {
  assertServerOnlyRuntime();
  return drizzle(client, { schema });
}

import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';

import { NestedTransactionNotSupportedError } from './errors.js';
import type { DatabasePool } from './pool.js';
import { withTransaction } from './transaction.js';

function createFakePool() {
  const queries: string[] = [];
  let released = false;
  const client = {
    query: async (statement: string) => {
      queries.push(statement);
      return { rows: [] };
    },
    release: () => {
      released = true;
    },
  } as unknown as PoolClient;
  const pool: DatabasePool = {
    metadata: {
      maxConnections: 1,
      idleTimeoutMs: 1_000,
      connectionTimeoutMs: 1_000,
    },
    connect: async () => client,
    end: async () => undefined,
  };

  return {
    pool,
    queries,
    wasReleased: () => released,
  };
}

describe('transaction helper', () => {
  it('rolls back callback failures and always releases the client', async () => {
    const fake = createFakePool();
    const callbackError = new Error('expected callback failure');

    await expect(
      withTransaction(fake.pool, async () => {
        throw callbackError;
      }),
    ).rejects.toBe(callbackError);

    expect(fake.queries).toEqual(['BEGIN', 'ROLLBACK']);
    expect(fake.wasReleased()).toBe(true);
  });

  it('fails explicitly instead of inventing nested transaction semantics', async () => {
    const fake = createFakePool();

    await expect(
      withTransaction(fake.pool, async (transaction) =>
        withTransaction(transaction, async () => undefined),
      ),
    ).rejects.toBeInstanceOf(NestedTransactionNotSupportedError);

    expect(fake.queries).toEqual(['BEGIN', 'ROLLBACK']);
    expect(fake.wasReleased()).toBe(true);
  });
});

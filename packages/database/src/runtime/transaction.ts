import type { PoolClient } from 'pg';

import { createDatabase, type Database } from './database.js';
import { DatabaseRuntimeError, NestedTransactionNotSupportedError } from './errors.js';
import type { DatabasePool } from './pool.js';

const transactionMarker = Symbol('habitacores.database.transaction');

export interface Transaction {
  readonly client: PoolClient;
  readonly database: Database;
  readonly [transactionMarker]: true;
}

export type TransactionCallback<Result> = (transaction: Transaction) => Promise<Result>;
export type TransactionSource = DatabasePool | Transaction;

function isTransaction(source: TransactionSource): source is Transaction {
  return transactionMarker in source;
}

export async function withTransaction<Result>(
  source: TransactionSource,
  callback: TransactionCallback<Result>,
): Promise<Result> {
  if (isTransaction(source)) {
    throw new NestedTransactionNotSupportedError();
  }

  const client = await source.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const transaction: Transaction = {
      client,
      database: createDatabase(client),
      [transactionMarker]: true,
    };
    const result = await callback(transaction);

    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch {
        throw new DatabaseRuntimeError('Database transaction rollback failed.');
      }
    }

    throw error;
  } finally {
    client.release();
  }
}

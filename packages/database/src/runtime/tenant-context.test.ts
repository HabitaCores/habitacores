import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { InvalidOrganizationContextError } from './errors.js';
import {
  ORGANIZATION_CONTEXT_SETTING,
  parseOrganizationContextId,
  setTransactionOrganizationContext,
} from './tenant-context.js';
import type { Transaction } from './transaction.js';

const VALID_ORGANIZATION_ID = '01890f47-6c8a-7c3d-8a21-9b7c1d2e3f40';

describe('transaction organization context', () => {
  it('validates and normalizes UUIDv7 identifiers', () => {
    expect(parseOrganizationContextId(VALID_ORGANIZATION_ID.toUpperCase())).toBe(
      VALID_ORGANIZATION_ID,
    );
    expect(() => parseOrganizationContextId('550e8400-e29b-41d4-a716-446655440000')).toThrow(
      InvalidOrganizationContextError,
    );
  });

  it('rejects invalid identifiers before executing SQL', async () => {
    const query = vi.fn();
    const transaction = {
      client: { query } as unknown as PoolClient,
    } as Transaction;

    await expect(
      setTransactionOrganizationContext(transaction, 'not-a-uuid'),
    ).rejects.toBeInstanceOf(InvalidOrganizationContextError);
    expect(query).not.toHaveBeenCalled();
  });

  it('sets valid context with parameterized transaction-local SQL', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const transaction = {
      client: { query } as unknown as PoolClient,
    } as Transaction;

    await setTransactionOrganizationContext(transaction, VALID_ORGANIZATION_ID);

    expect(query).toHaveBeenCalledWith('select set_config($1, $2, true)', [
      ORGANIZATION_CONTEXT_SETTING,
      VALID_ORGANIZATION_ID,
    ]);
  });
});

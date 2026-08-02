import {
  setTransactionOrganizationContext,
  withTransaction,
  type Transaction,
  type TransactionSource,
} from '@habitacores/database/runtime';

import {
  assertTrustedAuthorizedOrganizationContext,
  type AuthorizedOrganizationContext,
} from './authorized-context.js';

export async function withAuthorizedOrganizationTransaction<Result>(
  source: TransactionSource,
  context: AuthorizedOrganizationContext,
  callback: (transaction: Transaction) => Promise<Result>,
): Promise<Result> {
  assertTrustedAuthorizedOrganizationContext(context);

  return withTransaction(source, async (transaction) => {
    await setTransactionOrganizationContext(transaction, context.organizationId);
    return callback(transaction);
  });
}

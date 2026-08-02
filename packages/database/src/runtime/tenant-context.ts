import { InvalidOrganizationContextError } from './errors.js';
import type { Transaction } from './transaction.js';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ORGANIZATION_CONTEXT_SETTING = 'habitacores.organization_id';

export type OrganizationContextId = string & {
  readonly __organizationContextId: unique symbol;
};

export function parseOrganizationContextId(value: string): OrganizationContextId {
  if (!UUID_V7_PATTERN.test(value)) {
    throw new InvalidOrganizationContextError();
  }

  return value.toLowerCase() as OrganizationContextId;
}

export async function setTransactionOrganizationContext(
  transaction: Transaction,
  organizationId: string,
): Promise<void> {
  const validatedOrganizationId = parseOrganizationContextId(organizationId);

  await transaction.client.query('select set_config($1, $2, true)', [
    ORGANIZATION_CONTEXT_SETTING,
    validatedOrganizationId,
  ]);
}

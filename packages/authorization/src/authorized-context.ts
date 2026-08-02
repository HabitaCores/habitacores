import { AuthorizationError } from './errors.js';
import type { AuthorizedOrganizationContextFields } from './types.js';

const trustedContexts = new WeakSet<object>();
declare const authorizedOrganizationContextMarker: unique symbol;

export interface AuthorizedOrganizationContext extends AuthorizedOrganizationContextFields {
  readonly [authorizedOrganizationContextMarker]: true;
}

export function createAuthorizedOrganizationContext(
  fields: Omit<AuthorizedOrganizationContextFields, 'metadata'>,
): AuthorizedOrganizationContext {
  const context = Object.freeze({
    ...fields,
    permissions: Object.freeze([...fields.permissions]),
    metadata: Object.freeze({ source: 'organization-authorization-service' as const }),
  }) as AuthorizedOrganizationContext;
  trustedContexts.add(context);
  return context;
}

export function assertTrustedAuthorizedOrganizationContext(
  context: AuthorizedOrganizationContext,
): void {
  if (!trustedContexts.has(context)) {
    throw new AuthorizationError('INVALID_AUTHORIZATION_CONTEXT');
  }
}

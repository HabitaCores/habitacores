import type { RawSessionToken, SessionService } from '@habitacores/auth';
import type { Transaction, TransactionSource } from '@habitacores/database/runtime';

import { withAuthorizedOrganizationTransaction } from './authorized-transaction.js';
import type { OrganizationAuthorizationService } from './authorization-service.js';
import type { AuthorizationDecision, AuthorizationRequest } from './types.js';

export interface SessionAuthorizationRequest extends Omit<AuthorizationRequest, 'userId'> {
  readonly sessionToken: RawSessionToken;
}

export async function authorizeSessionForOrganization(
  sessions: SessionService,
  authorization: OrganizationAuthorizationService,
  request: SessionAuthorizationRequest,
): Promise<AuthorizationDecision> {
  const authentication = await sessions.validateSession(request.sessionToken);
  if (!authentication.authenticated) return { granted: false, reason: 'unauthenticated' };
  return authorization.authorize({
    userId: authentication.user.id,
    organizationId: request.organizationId,
    requiredPermissions: request.requiredPermissions,
  });
}

export async function withSessionAuthorizedOrganizationTransaction<Result>(
  source: TransactionSource,
  sessions: SessionService,
  authorization: OrganizationAuthorizationService,
  request: SessionAuthorizationRequest,
  callback: (transaction: Transaction) => Promise<Result>,
): Promise<Result | AuthorizationDecision> {
  const decision = await authorizeSessionForOrganization(sessions, authorization, request);
  if (!decision.granted) return decision;
  return withAuthorizedOrganizationTransaction(source, decision.context, callback);
}

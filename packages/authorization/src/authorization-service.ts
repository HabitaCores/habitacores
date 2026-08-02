import { AuthorizationError, type AuthorizationDenialReason } from './errors.js';
import { createAuthorizedOrganizationContext } from './authorized-context.js';
import type { AuthorizationRepository } from './repository.js';
import type { AuthorizationDecision, AuthorizationRequest } from './types.js';

function denied(reason: AuthorizationDenialReason): AuthorizationDecision {
  return { granted: false, reason };
}

export class OrganizationAuthorizationService {
  constructor(
    private readonly repository: AuthorizationRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async authorize(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    if (!request.userId) {
      return denied('unauthenticated');
    }

    try {
      const user = await this.repository.findUserState(request.userId);

      if (!user || user.lifecycleStatus !== 'active') {
        return denied('user_inactive');
      }

      const membership = await this.repository.findMembership(
        request.organizationId,
        request.userId,
      );

      if (!membership) {
        return denied('membership_not_found');
      }

      if (
        membership.organizationId !== request.organizationId ||
        membership.userId !== request.userId
      ) {
        return denied('organization_mismatch');
      }

      if (membership.status !== 'active') {
        return denied('membership_inactive');
      }

      const effectivePermissions = new Set(
        await this.repository.listEffectivePermissions(request.organizationId, membership.id),
      );

      if (request.requiredPermissions.some((permission) => !effectivePermissions.has(permission))) {
        return denied('permission_denied');
      }

      return {
        granted: true,
        context: createAuthorizedOrganizationContext({
          userId: request.userId,
          membershipId: membership.id,
          organizationId: request.organizationId,
          permissions: [...effectivePermissions].sort(),
          authorizedAt: this.now(),
        }),
      };
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }

      throw new AuthorizationError('UNEXPECTED_AUTHORIZATION_FAILURE');
    }
  }
}

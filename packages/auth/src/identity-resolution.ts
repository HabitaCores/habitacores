import { AuthenticationError, IdentityLinkError } from './errors.js';
import type { IdentityIdGenerator } from './identifiers.js';
import type { IdentityRepository } from './repository.js';
import type {
  ExternalIdentityLink,
  HabitacoresUser,
  IdentityResolution,
  VerifiedProviderIdentity,
} from './types.js';

function assertUserMayAuthenticate(user: HabitacoresUser): void {
  if (user.lifecycleStatus === 'suspended') {
    throw new AuthenticationError('SUSPENDED_USER');
  }

  if (user.lifecycleStatus === 'disabled') {
    throw new AuthenticationError('DISABLED_USER');
  }
}

export class IdentityResolutionService {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly idGenerator: IdentityIdGenerator,
  ) {}

  private async resolveLinkedIdentity(
    identity: VerifiedProviderIdentity,
    link: ExternalIdentityLink,
    identityLinkCreated: boolean,
  ): Promise<IdentityResolution> {
    const user = await this.repository.findUserById(link.userId);

    if (!user) {
      throw new AuthenticationError('UNEXPECTED_IDENTITY_RESOLUTION_FAILURE');
    }

    assertUserMayAuthenticate(user);

    if (!identityLinkCreated) {
      await this.repository.recordSuccessfulIdentityObservation({
        identityLinkId: link.id,
        authenticationMethod: identity.authenticationMethod,
        observedAt: identity.authenticatedAt,
      });
      await this.repository.updateProviderProfileObservations({
        identityLinkId: link.id,
        providerEmail: identity.providerEmail,
        providerPhone: identity.providerPhone,
        emailVerified: identity.emailVerified,
        phoneVerified: identity.phoneVerified,
        observedAt: identity.authenticatedAt,
      });
    }

    return {
      user,
      identityLinkCreated,
      authentication: {
        kind: 'habitacores-authenticated-identity',
        userId: user.id,
        identityLinkId: link.id,
        provider: link.provider,
        providerSubject: link.providerSubject,
        authenticationMethod: identity.authenticationMethod,
        assurance: identity.assurance,
        authenticatedAt: identity.authenticatedAt,
      },
    };
  }

  private async convergeAfterConflict(
    identity: VerifiedProviderIdentity,
  ): Promise<IdentityResolution> {
    const link = await this.repository.findIdentityLink(identity.provider, identity.subject);

    if (!link) {
      throw new AuthenticationError('UNEXPECTED_IDENTITY_RESOLUTION_FAILURE');
    }

    return this.resolveLinkedIdentity(identity, link, false);
  }

  async resolve(identity: VerifiedProviderIdentity): Promise<IdentityResolution> {
    try {
      const existingLink = await this.repository.findIdentityLink(
        identity.provider,
        identity.subject,
      );

      if (existingLink) {
        return await this.resolveLinkedIdentity(identity, existingLink, false);
      }

      const observedAt = identity.authenticatedAt;
      const user: HabitacoresUser = {
        id: this.idGenerator.createUserId(),
        lifecycleStatus: 'active',
        displayName: null,
        preferredEmail: null,
        preferredPhone: null,
        createdAt: observedAt,
        updatedAt: observedAt,
        suspendedAt: null,
        disabledAt: null,
      };
      const link: ExternalIdentityLink = {
        id: this.idGenerator.createIdentityLinkId(),
        userId: user.id,
        provider: identity.provider,
        providerSubject: identity.subject,
        providerEmail: identity.providerEmail,
        providerPhone: identity.providerPhone,
        emailVerified: identity.emailVerified,
        phoneVerified: identity.phoneVerified,
        authenticationMethod: identity.authenticationMethod,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        createdAt: observedAt,
        updatedAt: observedAt,
      };

      try {
        const created = await this.repository.createUserWithIdentityLink({
          user,
          identityLink: link,
        });

        return await this.resolveLinkedIdentity(identity, created.identityLink, true);
      } catch (error) {
        if (error instanceof IdentityLinkError && error.code === 'IDENTITY_CONFLICT') {
          return await this.convergeAfterConflict(identity);
        }

        throw error;
      }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError('UNEXPECTED_IDENTITY_RESOLUTION_FAILURE');
    }
  }
}

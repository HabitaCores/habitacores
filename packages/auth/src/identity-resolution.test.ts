import { describe, expect, it } from 'vitest';

import { AuthenticationError, IdentityLinkError } from './errors.js';
import { createUuidV7IdentityIdGenerator, type UserId } from './identifiers.js';
import { IdentityResolutionService } from './identity-resolution.js';
import type {
  IdentityRepository,
  NewUserWithIdentityLink,
  ProviderProfileObservationUpdate,
  SuccessfulIdentityObservation,
} from './repository.js';
import { createVerifiedProviderIdentity } from './trusted-boundary.js';
import type {
  ExternalIdentityLink,
  ExternalIdentityProvider,
  ExternalSubject,
  HabitacoresUser,
} from './types.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const LATER = new Date('2026-01-02T00:00:00.000Z');

class InMemoryIdentityRepository implements IdentityRepository {
  readonly users = new Map<UserId, HabitacoresUser>();
  readonly links = new Map<string, ExternalIdentityLink>();

  private key(provider: ExternalIdentityProvider, subject: ExternalSubject): string {
    return `${provider}\u0000${subject}`;
  }

  findUserById(userId: UserId): Promise<HabitacoresUser | null> {
    return Promise.resolve(this.users.get(userId) ?? null);
  }

  findIdentityLink(
    provider: ExternalIdentityProvider,
    subject: ExternalSubject,
  ): Promise<ExternalIdentityLink | null> {
    return Promise.resolve(this.links.get(this.key(provider, subject)) ?? null);
  }

  createUserWithIdentityLink(input: NewUserWithIdentityLink): Promise<NewUserWithIdentityLink> {
    const key = this.key(input.identityLink.provider, input.identityLink.providerSubject);

    if (this.links.has(key)) {
      return Promise.reject(new IdentityLinkError('IDENTITY_CONFLICT'));
    }

    this.users.set(input.user.id, input.user);
    this.links.set(key, input.identityLink);
    return Promise.resolve(input);
  }

  recordSuccessfulIdentityObservation(input: SuccessfulIdentityObservation): Promise<void> {
    const entry = [...this.links.entries()].find(([, link]) => link.id === input.identityLinkId);

    if (entry) {
      this.links.set(entry[0], {
        ...entry[1],
        authenticationMethod: input.authenticationMethod,
        lastSeenAt: input.observedAt,
        updatedAt: input.observedAt,
      });
    }

    return Promise.resolve();
  }

  updateProviderProfileObservations(input: ProviderProfileObservationUpdate): Promise<void> {
    const entry = [...this.links.entries()].find(([, link]) => link.id === input.identityLinkId);

    if (entry) {
      this.links.set(entry[0], {
        ...entry[1],
        providerEmail: input.providerEmail,
        providerPhone: input.providerPhone,
        emailVerified: input.emailVerified,
        phoneVerified: input.phoneVerified,
        updatedAt: input.observedAt,
      });
    }

    return Promise.resolve();
  }

  suspendUser(userId: UserId, suspendedAt: Date): Promise<HabitacoresUser | null> {
    return this.updateLifecycle(userId, 'suspended', suspendedAt);
  }

  disableUser(userId: UserId, disabledAt: Date): Promise<HabitacoresUser | null> {
    return this.updateLifecycle(userId, 'disabled', disabledAt);
  }

  private updateLifecycle(
    userId: UserId,
    lifecycleStatus: 'suspended' | 'disabled',
    changedAt: Date,
  ): Promise<HabitacoresUser | null> {
    const user = this.users.get(userId);

    if (!user) {
      return Promise.resolve(null);
    }

    const updated: HabitacoresUser = {
      ...user,
      lifecycleStatus,
      suspendedAt: lifecycleStatus === 'suspended' ? changedAt : user.suspendedAt,
      disabledAt: lifecycleStatus === 'disabled' ? changedAt : user.disabledAt,
      updatedAt: changedAt,
    };
    this.users.set(userId, updated);
    return Promise.resolve(updated);
  }
}

function verifiedIdentity(
  subject: string,
  overrides: Partial<Parameters<typeof createVerifiedProviderIdentity>[0]> = {},
) {
  return createVerifiedProviderIdentity({
    provider: 'supabase',
    subject,
    providerEmail: null,
    providerPhone: null,
    emailVerified: null,
    phoneVerified: null,
    authenticationMethod: 'password',
    authenticatedAt: NOW,
    ...overrides,
  });
}

function createService(repository: InMemoryIdentityRepository): IdentityResolutionService {
  return new IdentityResolutionService(repository, createUuidV7IdentityIdGenerator());
}

describe('identity resolution', () => {
  it('creates a Habitacores user and external link atomically through the repository', async () => {
    const repository = new InMemoryIdentityRepository();
    const result = await createService(repository).resolve(
      verifiedIdentity('new-subject', {
        providerEmail: 'shared@example.invalid',
        providerPhone: '+15550000000',
      }),
    );

    expect(result.identityLinkCreated).toBe(true);
    expect(result.user.preferredEmail).toBeNull();
    expect(result.user.preferredPhone).toBeNull();
    expect(result.authentication.userId).toBe(result.user.id);
    expect(repository.users).toHaveLength(1);
    expect(repository.links).toHaveLength(1);
  });

  it('resolves an existing link and updates only provider observations', async () => {
    const repository = new InMemoryIdentityRepository();
    const service = createService(repository);
    const initial = await service.resolve(verifiedIdentity('existing-subject'));

    const resolved = await service.resolve(
      verifiedIdentity('existing-subject', {
        providerEmail: 'observation@example.invalid',
        emailVerified: true,
        authenticatedAt: LATER,
      }),
    );
    const link = await repository.findIdentityLink(
      resolved.authentication.provider,
      resolved.authentication.providerSubject,
    );

    expect(resolved.identityLinkCreated).toBe(false);
    expect(resolved.user.id).toBe(initial.user.id);
    expect(resolved.user.preferredEmail).toBeNull();
    expect(link?.providerEmail).toBe('observation@example.invalid');
    expect(link?.lastSeenAt).toEqual(LATER);
  });

  it('does not link accounts from matching email observations', async () => {
    const repository = new InMemoryIdentityRepository();
    const service = createService(repository);
    const first = await service.resolve(
      verifiedIdentity('email-subject-a', { providerEmail: 'same@example.invalid' }),
    );
    const second = await service.resolve(
      verifiedIdentity('email-subject-b', { providerEmail: 'same@example.invalid' }),
    );

    expect(first.user.id).not.toBe(second.user.id);
    expect(repository.users).toHaveLength(2);
  });

  it('does not link accounts from matching phone observations', async () => {
    const repository = new InMemoryIdentityRepository();
    const service = createService(repository);
    const first = await service.resolve(
      verifiedIdentity('phone-subject-a', { providerPhone: '+15550000001' }),
    );
    const second = await service.resolve(
      verifiedIdentity('phone-subject-b', { providerPhone: '+15550000001' }),
    );

    expect(first.user.id).not.toBe(second.user.id);
    expect(repository.users).toHaveLength(2);
  });

  it('fails closed for suspended users', async () => {
    const repository = new InMemoryIdentityRepository();
    const service = createService(repository);
    const created = await service.resolve(verifiedIdentity('suspended-subject'));
    await repository.suspendUser(created.user.id, LATER);

    await expect(service.resolve(verifiedIdentity('suspended-subject'))).rejects.toEqual(
      new AuthenticationError('SUSPENDED_USER'),
    );
  });

  it('fails closed for disabled users', async () => {
    const repository = new InMemoryIdentityRepository();
    const service = createService(repository);
    const created = await service.resolve(verifiedIdentity('disabled-subject'));
    await repository.disableUser(created.user.id, LATER);

    await expect(service.resolve(verifiedIdentity('disabled-subject'))).rejects.toEqual(
      new AuthenticationError('DISABLED_USER'),
    );
  });
});

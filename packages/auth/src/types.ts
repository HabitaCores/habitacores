import type { Brand } from '@habitacores/domain';

import type { IdentityLinkId, UserId } from './identifiers.js';

export const EXTERNAL_IDENTITY_PROVIDERS = ['supabase'] as const;
export type ExternalIdentityProvider = (typeof EXTERNAL_IDENTITY_PROVIDERS)[number];

export type ExternalSubject = Brand<string, 'ExternalSubject'>;
export type RawBearerToken = Brand<string, 'RawBearerToken'>;

export const AUTHENTICATION_METHODS = ['password', 'magic_link', 'oauth', 'otp', 'sso'] as const;
export type AuthenticationMethod = (typeof AUTHENTICATION_METHODS)[number];

export type AuthenticationAssuranceLevel = 'aal1' | 'aal2';

export interface AuthenticationAssurance {
  readonly level: AuthenticationAssuranceLevel;
  readonly methods: readonly AuthenticationMethod[];
}

export type UserLifecycleStatus = 'active' | 'suspended' | 'disabled';

export interface ProviderIdentityObservations {
  readonly providerEmail: string | null;
  readonly providerPhone: string | null;
  readonly emailVerified: boolean | null;
  readonly phoneVerified: boolean | null;
}

export interface VerifiedProviderIdentity extends ProviderIdentityObservations {
  readonly kind: 'verified-provider-identity';
  readonly provider: ExternalIdentityProvider;
  readonly subject: ExternalSubject;
  readonly authenticationMethod: AuthenticationMethod | null;
  readonly assurance: AuthenticationAssurance | null;
  readonly authenticatedAt: Date;
}

export interface HabitacoresUser {
  readonly id: UserId;
  readonly lifecycleStatus: UserLifecycleStatus;
  readonly displayName: string | null;
  readonly preferredEmail: string | null;
  readonly preferredPhone: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly suspendedAt: Date | null;
  readonly disabledAt: Date | null;
}

export interface ExternalIdentityLink extends ProviderIdentityObservations {
  readonly id: IdentityLinkId;
  readonly userId: UserId;
  readonly provider: ExternalIdentityProvider;
  readonly providerSubject: ExternalSubject;
  readonly authenticationMethod: AuthenticationMethod | null;
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AuthenticatedIdentity {
  readonly kind: 'habitacores-authenticated-identity';
  readonly userId: UserId;
  readonly identityLinkId: IdentityLinkId;
  readonly provider: ExternalIdentityProvider;
  readonly providerSubject: ExternalSubject;
  readonly authenticationMethod: AuthenticationMethod | null;
  readonly assurance: AuthenticationAssurance | null;
  readonly authenticatedAt: Date;
}

export interface IdentityResolution {
  readonly user: HabitacoresUser;
  readonly identityLinkCreated: boolean;
  readonly authentication: AuthenticatedIdentity;
}

import type { Brand } from '@habitacores/domain';

import type { SessionId, TotpEnrollmentId, UserId } from './identifiers.js';
import type {
  AuthenticationMethod,
  HabitacoresUser,
  IdentityResolution,
  VerifiedProviderIdentity,
} from './types.js';

export type RawSessionToken = Brand<string, 'RawSessionToken'>;
export type SessionTokenDigest = Brand<string, 'SessionTokenDigest'>;
export type RawAuthenticationToken = Brand<string, 'RawAuthenticationToken'>;
export type RawTotpSecret = Brand<string, 'RawTotpSecret'>;
export type RawRecoveryCode = Brand<string, 'RawRecoveryCode'>;
export type ProtectedTotpSecret = Brand<string, 'ProtectedTotpSecret'>;
export type RecoveryCodeHash = Brand<string, 'RecoveryCodeHash'>;

export type SessionStatus = 'active' | 'revoked' | 'expired';
export type SessionAssuranceLevel = 'single_factor' | 'multi_factor';
export type SessionInvalidationReason =
  | 'logout'
  | 'user_suspended'
  | 'user_disabled'
  | 'expired'
  | 'invalid_session'
  | 'rotated'
  | 'mfa_changed';

export interface AuthenticatedHabitacoresUser {
  readonly kind: 'authenticated-habitacores-user';
  readonly user: HabitacoresUser;
}

export interface AuthenticatedSession {
  readonly kind: 'habitacores-authenticated-session';
  readonly id: SessionId;
  readonly userId: UserId;
  readonly status: SessionStatus;
  readonly authenticationMethod: AuthenticationMethod;
  readonly assuranceLevel: SessionAssuranceLevel;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly revokedAt: Date | null;
  readonly revocationReason: SessionInvalidationReason | null;
  readonly replacedBySessionId: SessionId | null;
  readonly ipHash: string | null;
  readonly userAgentHash: string | null;
}

export interface PersistedSession extends AuthenticatedSession {
  readonly lookupDigest: SessionTokenDigest;
}

export interface SessionCreationRequest {
  readonly verifiedIdentity: VerifiedProviderIdentity;
  readonly identityResolution: IdentityResolution;
  readonly ipHash?: string | null;
  readonly userAgentHash?: string | null;
}

export interface CreatedSession {
  readonly session: AuthenticatedSession;
  readonly rawToken: RawSessionToken;
}

export type SessionValidationResult =
  | {
      readonly authenticated: true;
      readonly session: AuthenticatedSession;
      readonly user: HabitacoresUser;
    }
  | {
      readonly authenticated: false;
      readonly reason:
        'missing' | 'invalid' | 'expired' | 'revoked' | 'user_inactive' | 'insufficient_assurance';
    };

export type TotpEnrollmentStatus = 'pending' | 'active' | 'disabled';
export interface TotpEnrollment {
  readonly id: TotpEnrollmentId;
  readonly userId: UserId;
  readonly status: TotpEnrollmentStatus;
  readonly secretCiphertext: ProtectedTotpSecret;
  readonly secretKeyVersion: number;
  readonly createdAt: Date;
  readonly verifiedAt: Date | null;
  readonly disabledAt: Date | null;
  readonly lastUsedAt: Date | null;
}

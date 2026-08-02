import type { MfaChallengeId, SessionId, TotpEnrollmentId, UserId } from './identifiers.js';
import type {
  ProtectedTotpSecret,
  RawRecoveryCode,
  RawTotpSecret,
  RecoveryCodeHash,
  TotpEnrollment,
} from './session-types.js';

export type MfaChallengeType = 'totp' | 'recovery_code';
export type MfaChallengeStatus = 'pending' | 'verified' | 'failed' | 'expired';

export interface MfaRecoveryCode {
  readonly enrollmentId: TotpEnrollmentId;
  readonly codeHash: RecoveryCodeHash;
  readonly createdAt: Date;
  readonly usedAt: Date | null;
}

export interface MfaChallenge {
  readonly id: MfaChallengeId;
  readonly userId: UserId;
  readonly sessionId: SessionId | null;
  readonly enrollmentId: TotpEnrollmentId;
  readonly challengeType: MfaChallengeType;
  readonly status: MfaChallengeStatus;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly verifiedAt: Date | null;
  readonly attemptCount: number;
  readonly maxAttempts: number;
}

export interface TotpAlgorithmConfiguration {
  readonly stepSeconds: number;
  readonly digits: 6 | 8;
  readonly allowedWindow: 0 | 1 | 2;
}

export interface TotpAlgorithm {
  generateSecret(): RawTotpSecret;
  verify(
    secret: RawTotpSecret,
    code: string,
    at: Date,
    configuration: TotpAlgorithmConfiguration,
  ): Promise<boolean>;
}

export interface TotpSecretProtection {
  protect(secret: RawTotpSecret): Promise<{
    readonly ciphertext: ProtectedTotpSecret;
    readonly keyVersion: number;
  }>;
  reveal(ciphertext: ProtectedTotpSecret, keyVersion: number): Promise<RawTotpSecret>;
}

export interface RecoveryCodeProtection {
  generateCodes(): readonly RawRecoveryCode[];
  hash(code: RawRecoveryCode): Promise<RecoveryCodeHash>;
  matches(code: RawRecoveryCode, expectedHash: RecoveryCodeHash): Promise<boolean>;
}

export interface StartedTotpEnrollment {
  readonly enrollment: TotpEnrollment;
  readonly secret: RawTotpSecret;
  readonly recoveryCodes: readonly RawRecoveryCode[];
}

export interface MfaVerificationResult {
  readonly verified: boolean;
  readonly elevatedSession?: import('./session-types.js').CreatedSession;
}

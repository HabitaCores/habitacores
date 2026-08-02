import type { MfaChallengeId, SessionId, TotpEnrollmentId, UserId } from './identifiers.js';
import type { MfaChallenge, MfaRecoveryCode } from './mfa-types.js';
import type { RecoveryCodeHash, TotpEnrollment } from './session-types.js';

export interface MfaRepository {
  createTotpEnrollment(
    enrollment: TotpEnrollment,
    recoveryCodes: readonly MfaRecoveryCode[],
  ): Promise<TotpEnrollment>;
  findTotpEnrollment(enrollmentId: TotpEnrollmentId): Promise<TotpEnrollment | null>;
  markTotpEnrollmentVerified(enrollmentId: TotpEnrollmentId, verifiedAt: Date): Promise<boolean>;
  disableTotpEnrollment(enrollmentId: TotpEnrollmentId, disabledAt: Date): Promise<boolean>;
  listUnusedRecoveryCodes(enrollmentId: TotpEnrollmentId): Promise<readonly MfaRecoveryCode[]>;
  consumeRecoveryCode(
    enrollmentId: TotpEnrollmentId,
    codeHash: RecoveryCodeHash,
    usedAt: Date,
  ): Promise<boolean>;
  createChallenge(challenge: MfaChallenge): Promise<MfaChallenge>;
  findChallenge(challengeId: MfaChallengeId): Promise<MfaChallenge | null>;
  recordFailedChallengeAttempt(challengeId: MfaChallengeId, at: Date): Promise<MfaChallenge | null>;
  verifyChallenge(challengeId: MfaChallengeId, verifiedAt: Date): Promise<boolean>;
  expireChallenge(challengeId: MfaChallengeId, expiredAt: Date): Promise<boolean>;
  touchEnrollment(enrollmentId: TotpEnrollmentId, lastUsedAt: Date): Promise<void>;
  findActiveEnrollmentForUser(userId: UserId): Promise<TotpEnrollment | null>;
  invalidateChallengesForSession(sessionId: SessionId, at: Date): Promise<number>;
}

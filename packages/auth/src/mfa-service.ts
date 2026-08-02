import { SessionError } from './errors.js';
import type {
  MfaChallengeId,
  SecurityIdGenerator,
  SessionId,
  TotpEnrollmentId,
  UserId,
} from './identifiers.js';
import type { MfaConfiguration } from './mfa-config.js';
import { createVerifiedMfaElevation } from './mfa-elevation.js';
import type { MfaRepository } from './mfa-repository.js';
import type {
  MfaChallenge,
  MfaChallengeType,
  MfaVerificationResult,
  RecoveryCodeProtection,
  StartedTotpEnrollment,
  TotpAlgorithm,
  TotpSecretProtection,
} from './mfa-types.js';
import type { RawRecoveryCode, RawSessionToken, TotpEnrollment } from './session-types.js';
import type { SessionService } from './session-service.js';

export class MfaService {
  constructor(
    private readonly repository: MfaRepository,
    private readonly sessions: SessionService,
    private readonly totp: TotpAlgorithm,
    private readonly secrets: TotpSecretProtection,
    private readonly recoveryCodes: RecoveryCodeProtection,
    private readonly ids: SecurityIdGenerator,
    private readonly configuration: MfaConfiguration,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async startTotpEnrollment(userId: UserId): Promise<StartedTotpEnrollment> {
    const secret = this.totp.generateSecret();
    const protectedSecret = await this.secrets.protect(secret);
    const rawRecoveryCodes = this.recoveryCodes.generateCodes();
    const createdAt = this.now();
    const enrollment: TotpEnrollment = {
      id: this.ids.createTotpEnrollmentId(),
      userId,
      status: 'pending',
      secretCiphertext: protectedSecret.ciphertext,
      secretKeyVersion: protectedSecret.keyVersion,
      createdAt,
      verifiedAt: null,
      disabledAt: null,
      lastUsedAt: null,
    };
    const persistedCodes = await Promise.all(
      rawRecoveryCodes.map(async (code) => ({
        enrollmentId: enrollment.id,
        codeHash: await this.recoveryCodes.hash(code),
        createdAt,
        usedAt: null,
      })),
    );
    const persisted = await this.repository.createTotpEnrollment(enrollment, persistedCodes);
    return { enrollment: persisted, secret, recoveryCodes: rawRecoveryCodes };
  }

  async verifyTotpEnrollment(enrollmentId: TotpEnrollmentId, code: string): Promise<boolean> {
    const enrollment = await this.repository.findTotpEnrollment(enrollmentId);
    if (!enrollment || enrollment.status !== 'pending') {
      throw new SessionError('MFA_ENROLLMENT_INACTIVE');
    }
    const secret = await this.secrets.reveal(
      enrollment.secretCiphertext,
      enrollment.secretKeyVersion,
    );
    if (!(await this.totp.verify(secret, code, this.now(), this.configuration.totp))) return false;
    return this.repository.markTotpEnrollmentVerified(enrollment.id, this.now());
  }

  async disableTotpEnrollment(enrollmentId: TotpEnrollmentId): Promise<boolean> {
    const enrollment = await this.repository.findTotpEnrollment(enrollmentId);
    if (!enrollment) return false;
    const disabled = await this.repository.disableTotpEnrollment(enrollment.id, this.now());
    if (disabled) await this.sessions.revokeAllSessionsForUser(enrollment.userId, 'mfa_changed');
    return disabled;
  }

  async createChallenge(
    userId: UserId,
    sessionId: SessionId,
    challengeType: MfaChallengeType = 'totp',
  ): Promise<MfaChallenge> {
    const enrollment = await this.repository.findActiveEnrollmentForUser(userId);
    if (!enrollment) throw new SessionError('MFA_CHALLENGE_INVALID');
    const createdAt = this.now();
    return this.repository.createChallenge({
      id: this.ids.createMfaChallengeId(),
      userId,
      sessionId,
      enrollmentId: enrollment.id,
      challengeType,
      status: 'pending',
      createdAt,
      expiresAt: new Date(
        createdAt.getTime() + this.configuration.challengeLifetimeSeconds * 1_000,
      ),
      verifiedAt: null,
      attemptCount: 0,
      maxAttempts: this.configuration.maximumAttempts,
    });
  }

  async verifyTotpChallenge(
    challengeId: MfaChallengeId,
    code: string,
    sessionToken: RawSessionToken,
  ): Promise<MfaVerificationResult> {
    const challenge = await this.requirePendingChallenge(challengeId, 'totp');
    const enrollment = await this.repository.findTotpEnrollment(challenge.enrollmentId);
    if (!enrollment || enrollment.status !== 'active') {
      throw new SessionError('MFA_CHALLENGE_INVALID');
    }
    const secret = await this.secrets.reveal(
      enrollment.secretCiphertext,
      enrollment.secretKeyVersion,
    );
    if (!(await this.totp.verify(secret, code, this.now(), this.configuration.totp))) {
      await this.recordFailure(challenge);
      return { verified: false };
    }
    return this.completeChallenge(challenge, sessionToken);
  }

  async verifyRecoveryChallenge(
    challengeId: MfaChallengeId,
    code: RawRecoveryCode,
    sessionToken: RawSessionToken,
  ): Promise<MfaVerificationResult> {
    const challenge = await this.requirePendingChallenge(challengeId, 'recovery_code');
    const candidates = await this.repository.listUnusedRecoveryCodes(challenge.enrollmentId);
    let matched = null as (typeof candidates)[number] | null;
    for (const candidate of candidates) {
      if (await this.recoveryCodes.matches(code, candidate.codeHash)) matched = candidate;
    }
    if (
      !matched ||
      !(await this.repository.consumeRecoveryCode(
        challenge.enrollmentId,
        matched.codeHash,
        this.now(),
      ))
    ) {
      await this.recordFailure(challenge);
      return { verified: false };
    }
    return this.completeChallenge(challenge, sessionToken);
  }

  private async requirePendingChallenge(
    challengeId: MfaChallengeId,
    expectedType: MfaChallengeType,
  ): Promise<MfaChallenge> {
    const challenge = await this.repository.findChallenge(challengeId);
    if (!challenge || challenge.status !== 'pending' || challenge.challengeType !== expectedType) {
      throw new SessionError('MFA_CHALLENGE_INVALID');
    }
    if (challenge.expiresAt.getTime() <= this.now().getTime()) {
      await this.repository.expireChallenge(challenge.id, this.now());
      throw new SessionError('MFA_CHALLENGE_EXPIRED');
    }
    if (challenge.attemptCount >= challenge.maxAttempts) {
      throw new SessionError('MFA_CHALLENGE_EXHAUSTED');
    }
    return challenge;
  }

  private async recordFailure(challenge: MfaChallenge): Promise<void> {
    const updated = await this.repository.recordFailedChallengeAttempt(challenge.id, this.now());
    if (!updated || updated.attemptCount >= updated.maxAttempts) {
      throw new SessionError('MFA_CHALLENGE_EXHAUSTED');
    }
  }

  private async completeChallenge(
    challenge: MfaChallenge,
    sessionToken: RawSessionToken,
  ): Promise<MfaVerificationResult> {
    const verifiedAt = this.now();
    if (!(await this.repository.verifyChallenge(challenge.id, verifiedAt))) {
      throw new SessionError('MFA_CHALLENGE_INVALID');
    }
    await this.repository.touchEnrollment(challenge.enrollmentId, verifiedAt);
    const elevatedSession = await this.sessions.elevateSessionAfterMfa(
      sessionToken,
      createVerifiedMfaElevation(),
    );
    if (challenge.sessionId) {
      await this.repository.invalidateChallengesForSession(challenge.sessionId, verifiedAt);
    }
    return { verified: true, elevatedSession };
  }
}

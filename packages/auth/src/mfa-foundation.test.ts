import { describe, expect, it } from 'vitest';

import { SessionError } from './errors.js';
import {
  parseMfaChallengeId,
  parseSessionId,
  parseTotpEnrollmentId,
  parseUserId,
  type SecurityIdGenerator,
} from './identifiers.js';
import { parseMfaConfiguration } from './mfa-config.js';
import type { MfaRepository } from './mfa-repository.js';
import { MfaService } from './mfa-service.js';
import type {
  MfaChallenge,
  MfaRecoveryCode,
  RecoveryCodeProtection,
  TotpAlgorithm,
  TotpSecretProtection,
} from './mfa-types.js';
import type {
  RawRecoveryCode,
  RawSessionToken,
  RawTotpSecret,
  RecoveryCodeHash,
  TotpEnrollment,
} from './session-types.js';
import type { SessionService } from './session-service.js';

const userId = parseUserId('018f0000-0000-7000-8000-000000000001');
const sessionId = parseSessionId('018f0000-0000-7000-8000-000000000002');
const enrollmentId = parseTotpEnrollmentId('018f0000-0000-7000-8000-000000000003');
const challengeId = parseMfaChallengeId('018f0000-0000-7000-8000-000000000004');
const at = new Date('2026-01-01T00:00:00.000Z');

class MemoryMfa implements MfaRepository {
  enrollment: TotpEnrollment | null = null;
  codes: MfaRecoveryCode[] = [];
  challenge: MfaChallenge | null = null;
  async createTotpEnrollment(value: TotpEnrollment, codes: readonly MfaRecoveryCode[]) {
    this.enrollment = value;
    this.codes = [...codes];
    return value;
  }
  async findTotpEnrollment() {
    return this.enrollment;
  }
  async markTotpEnrollmentVerified(_id: TotpEnrollment['id'], verifiedAt: Date) {
    if (!this.enrollment || this.enrollment.status !== 'pending') return false;
    this.enrollment = { ...this.enrollment, status: 'active', verifiedAt };
    return true;
  }
  async disableTotpEnrollment(_id: TotpEnrollment['id'], disabledAt: Date) {
    if (!this.enrollment) return false;
    this.enrollment = { ...this.enrollment, status: 'disabled', disabledAt };
    return true;
  }
  async listUnusedRecoveryCodes() {
    return this.codes.filter((code) => !code.usedAt);
  }
  async consumeRecoveryCode(_id: TotpEnrollment['id'], hash: RecoveryCodeHash, usedAt: Date) {
    const index = this.codes.findIndex((code) => code.codeHash === hash && !code.usedAt);
    if (index < 0) return false;
    this.codes[index] = { ...this.codes[index]!, usedAt };
    return true;
  }
  async createChallenge(value: MfaChallenge) {
    this.challenge = value;
    return value;
  }
  async findChallenge() {
    return this.challenge;
  }
  async recordFailedChallengeAttempt(_id: MfaChallenge['id'], _at: Date) {
    void _id;
    void _at;
    if (!this.challenge) return null;
    const attemptCount = this.challenge.attemptCount + 1;
    this.challenge = {
      ...this.challenge,
      attemptCount,
      status: attemptCount >= this.challenge.maxAttempts ? 'failed' : 'pending',
    };
    return this.challenge;
  }
  async verifyChallenge(_id: MfaChallenge['id'], verifiedAt: Date) {
    if (!this.challenge || this.challenge.status !== 'pending') return false;
    this.challenge = { ...this.challenge, status: 'verified', verifiedAt };
    return true;
  }
  async expireChallenge() {
    if (!this.challenge) return false;
    this.challenge = { ...this.challenge, status: 'expired' };
    return true;
  }
  async touchEnrollment(_id: TotpEnrollment['id'], lastUsedAt: Date) {
    if (this.enrollment) this.enrollment = { ...this.enrollment, lastUsedAt };
  }
  async findActiveEnrollmentForUser() {
    return this.enrollment?.status === 'active' ? this.enrollment : null;
  }
  async invalidateChallengesForSession() {
    return 0;
  }
}

function harness() {
  const repository = new MemoryMfa();
  let clock = at;
  let elevated = 0;
  const sessions = {
    elevateSessionAfterMfa: async () => {
      elevated += 1;
      return {
        rawToken: 'elevated' as RawSessionToken,
        session: { assuranceLevel: 'multi_factor' },
      };
    },
    revokeAllSessionsForUser: async () => 1,
  } as unknown as SessionService;
  const totp: TotpAlgorithm = {
    generateSecret: () => 'raw-secret' as RawTotpSecret,
    verify: async (_secret, code) => code === '123456',
  };
  const secrets: TotpSecretProtection = {
    protect: async () => ({
      ciphertext: 'encrypted:v1' as TotpEnrollment['secretCiphertext'],
      keyVersion: 1,
    }),
    reveal: async () => 'raw-secret' as RawTotpSecret,
  };
  const recovery: RecoveryCodeProtection = {
    generateCodes: () => ['recovery-one' as RawRecoveryCode],
    hash: async (code) => `hash:${code}` as RecoveryCodeHash,
    matches: async (code, hash) => hash === `hash:${code}`,
  };
  const ids: SecurityIdGenerator = {
    createSessionId: () => sessionId,
    createTotpEnrollmentId: () => enrollmentId,
    createMfaChallengeId: () => challengeId,
  };
  const service = new MfaService(
    repository,
    sessions,
    totp,
    secrets,
    recovery,
    ids,
    parseMfaConfiguration({ challengeLifetimeSeconds: 60, maximumAttempts: 2 }),
    () => clock,
  );
  return {
    repository,
    service,
    elevated: () => elevated,
    setClock: (value: Date) => {
      clock = value;
    },
  };
}

describe('TOTP MFA foundation', () => {
  it('persists protected secrets and recovery hashes only', async () => {
    const { repository, service } = harness();
    const started = await service.startTotpEnrollment(userId);
    expect(started.secret).toBe('raw-secret');
    expect(started.recoveryCodes).toEqual(['recovery-one']);
    expect(repository.enrollment?.secretCiphertext).toBe('encrypted:v1');
    expect(JSON.stringify(repository.enrollment)).not.toContain('raw-secret');
    expect(repository.codes[0]?.codeHash).toBe('hash:recovery-one');
    expect(JSON.stringify(repository.codes)).not.toContain('"recovery-one"');
  });
  it('pending and disabled enrollment grant no challenge', async () => {
    const { service } = harness();
    await service.startTotpEnrollment(userId);
    await expect(service.createChallenge(userId, sessionId)).rejects.toMatchObject({
      code: 'MFA_CHALLENGE_INVALID',
    });
    expect(await service.verifyTotpEnrollment(enrollmentId, '123456')).toBe(true);
    await service.disableTotpEnrollment(enrollmentId);
    await expect(service.createChallenge(userId, sessionId)).rejects.toMatchObject({
      code: 'MFA_CHALLENGE_INVALID',
    });
  });
  it('verified TOTP challenge elevates only after success', async () => {
    const { service, elevated } = harness();
    await service.startTotpEnrollment(userId);
    await service.verifyTotpEnrollment(enrollmentId, '123456');
    await service.createChallenge(userId, sessionId);
    expect(
      await service.verifyTotpChallenge(challengeId, '123456', 'session' as RawSessionToken),
    ).toMatchObject({
      verified: true,
      elevatedSession: { session: { assuranceLevel: 'multi_factor' } },
    });
    expect(elevated()).toBe(1);
  });
  it('expires challenges and fails closed after bounded attempts', async () => {
    const expired = harness();
    await expired.service.startTotpEnrollment(userId);
    await expired.service.verifyTotpEnrollment(enrollmentId, '123456');
    await expired.service.createChallenge(userId, sessionId);
    expired.setClock(new Date('2026-01-01T00:01:00.001Z'));
    await expect(
      expired.service.verifyTotpChallenge(challengeId, '123456', 'session' as RawSessionToken),
    ).rejects.toEqual(new SessionError('MFA_CHALLENGE_EXPIRED'));
    const bounded = harness();
    await bounded.service.startTotpEnrollment(userId);
    await bounded.service.verifyTotpEnrollment(enrollmentId, '123456');
    await bounded.service.createChallenge(userId, sessionId);
    expect(
      await bounded.service.verifyTotpChallenge(challengeId, 'bad', 'session' as RawSessionToken),
    ).toEqual({ verified: false });
    await expect(
      bounded.service.verifyTotpChallenge(challengeId, 'bad', 'session' as RawSessionToken),
    ).rejects.toMatchObject({ code: 'MFA_CHALLENGE_EXHAUSTED' });
    expect(bounded.elevated()).toBe(0);
  });
  it('consumes recovery codes only once', async () => {
    const { service } = harness();
    await service.startTotpEnrollment(userId);
    await service.verifyTotpEnrollment(enrollmentId, '123456');
    await service.createChallenge(userId, sessionId, 'recovery_code');
    expect(
      (
        await service.verifyRecoveryChallenge(
          challengeId,
          'recovery-one' as RawRecoveryCode,
          'session' as RawSessionToken,
        )
      ).verified,
    ).toBe(true);
    await expect(
      service.verifyRecoveryChallenge(
        challengeId,
        'recovery-one' as RawRecoveryCode,
        'session' as RawSessionToken,
      ),
    ).rejects.toMatchObject({ code: 'MFA_CHALLENGE_INVALID' });
  });
  it('validates algorithm configuration', () => {
    expect(() =>
      parseMfaConfiguration({ totp: { stepSeconds: 1, digits: 6, allowedWindow: 1 } }),
    ).toThrowError(SessionError);
  });
});

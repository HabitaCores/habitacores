import { describe, expect, it } from 'vitest';

import { SessionError } from './errors.js';
import { parseSessionId, parseUserId, type SecurityIdGenerator } from './identifiers.js';
import type { IdentityRepository } from './repository.js';
import { parseSessionConfiguration } from './session-config.js';
import { createClearedSessionCookie, createSessionCookie } from './session-cookie.js';
import { createNodeSessionTokenCrypto, type SessionTokenCrypto } from './session-crypto.js';
import type { SessionRepository } from './session-repository.js';
import { SessionService } from './session-service.js';
import type { PersistedSession, RawSessionToken, SessionTokenDigest } from './session-types.js';
import type { HabitacoresUser, IdentityResolution, VerifiedProviderIdentity } from './types.js';

const userId = parseUserId('018f0000-0000-7000-8000-000000000001');
const now = new Date('2026-01-01T00:00:00.000Z');
const activeUser: HabitacoresUser = {
  id: userId,
  lifecycleStatus: 'active',
  displayName: null,
  preferredEmail: null,
  preferredPhone: null,
  createdAt: now,
  updatedAt: now,
  suspendedAt: null,
  disabledAt: null,
};
const verified: VerifiedProviderIdentity = {
  kind: 'verified-provider-identity',
  provider: 'supabase',
  subject: 'provider-subject' as VerifiedProviderIdentity['subject'],
  providerEmail: null,
  providerPhone: null,
  emailVerified: null,
  phoneVerified: null,
  authenticationMethod: 'oauth',
  assurance: { level: 'aal2', methods: ['oauth'] },
  authenticatedAt: now,
};
const resolution: IdentityResolution = {
  user: activeUser,
  identityLinkCreated: false,
  authentication: {
    kind: 'habitacores-authenticated-identity',
    userId,
    identityLinkId:
      '018f0000-0000-7000-8000-000000000010' as IdentityResolution['authentication']['identityLinkId'],
    provider: 'supabase',
    providerSubject: verified.subject,
    authenticationMethod: 'oauth',
    assurance: verified.assurance,
    authenticatedAt: now,
  },
};

class MemorySessions implements SessionRepository {
  readonly records = new Map<string, PersistedSession>();
  async createSession(session: PersistedSession) {
    this.records.set(session.id, session);
    return session;
  }
  async findSessionByTokenDigest(digest: SessionTokenDigest) {
    return [...this.records.values()].find((item) => item.lookupDigest === digest) ?? null;
  }
  async updateLastSeen(id: PersistedSession['id'], expected: Date, lastSeen: Date, expires: Date) {
    const item = this.records.get(id);
    if (!item || item.lastSeenAt.getTime() !== expected.getTime() || item.status !== 'active')
      return false;
    this.records.set(id, { ...item, lastSeenAt: lastSeen, expiresAt: expires });
    return true;
  }
  async rotateSession(id: PersistedSession['id'], replacement: PersistedSession) {
    const item = this.records.get(id);
    if (!item || item.status !== 'active') return false;
    this.records.set(replacement.id, replacement);
    this.records.set(id, {
      ...item,
      status: 'revoked',
      revokedAt: replacement.createdAt,
      revocationReason: 'rotated',
      replacedBySessionId: replacement.id,
    });
    return true;
  }
  async revokeSession(
    id: PersistedSession['id'],
    reason: PersistedSession['revocationReason'],
    at: Date,
  ) {
    const item = this.records.get(id);
    if (!item || item.status !== 'active' || !reason) return false;
    this.records.set(id, {
      ...item,
      status: reason === 'expired' ? 'expired' : 'revoked',
      revokedAt: at,
      revocationReason: reason,
    });
    return true;
  }
  async revokeAllSessionsForUser(
    id: PersistedSession['userId'],
    reason: NonNullable<PersistedSession['revocationReason']>,
    at: Date,
  ) {
    let count = 0;
    for (const item of this.records.values())
      if (item.userId === id && item.status === 'active') {
        this.records.set(item.id, {
          ...item,
          status: 'revoked',
          revokedAt: at,
          revocationReason: reason,
        });
        count += 1;
      }
    return count;
  }
  async listActiveSessionsForUser(id: PersistedSession['userId'], at: Date) {
    return [...this.records.values()].filter(
      (item) => item.userId === id && item.status === 'active' && item.expiresAt > at,
    );
  }
}

function harness(lifecycleStatus: HabitacoresUser['lifecycleStatus'] = 'active') {
  const repository = new MemorySessions();
  let clock = now;
  let sequence = 1;
  const crypto: SessionTokenCrypto = {
    generateToken: () => `raw-${sequence}` as RawSessionToken,
    digestToken: (token) => `digest-${token.replace('raw-', '')}` as SessionTokenDigest,
    matchesDigest: (token, digest) => digest === `digest-${token.replace('raw-', '')}`,
  };
  const ids: SecurityIdGenerator = {
    createSessionId: () =>
      parseSessionId(`018f0000-0000-7000-8000-${String(sequence++).padStart(12, '0')}`),
    createMfaChallengeId: () => {
      throw new Error('unused');
    },
    createTotpEnrollmentId: () => {
      throw new Error('unused');
    },
  };
  const identities = {
    findUserById: async () => ({ ...activeUser, lifecycleStatus }),
  } as unknown as IdentityRepository;
  const service = new SessionService(
    repository,
    identities,
    crypto,
    ids,
    parseSessionConfiguration({
      idleTimeoutSeconds: 300,
      absoluteTimeoutSeconds: 900,
      environment: 'test',
    }),
    () => clock,
  );
  return {
    repository,
    service,
    setClock: (value: Date) => {
      clock = value;
    },
  };
}

describe('session security', () => {
  it('uses opaque Node tokens and a one-way digest', () => {
    const crypto = createNodeSessionTokenCrypto();
    const token = crypto.generateToken();
    const digest = crypto.digestToken(token);
    expect(token).toHaveLength(43);
    expect(digest).not.toBe(token);
    expect(crypto.matchesDigest(token, digest)).toBe(true);
  });
  it('persists only the digest and ignores provider assurance', async () => {
    const { repository, service } = harness();
    const created = await service.createSession({
      verifiedIdentity: verified,
      identityResolution: resolution,
    });
    const persisted = [...repository.records.values()][0]!;
    expect(persisted.lookupDigest).toBe('digest-1');
    expect(JSON.stringify(persisted)).not.toContain(created.rawToken);
    expect(created.session.assuranceLevel).toBe('single_factor');
    expect(created.session).not.toHaveProperty('lookupDigest');
  });
  it('fails expired, revoked, suspended, and disabled sessions closed', async () => {
    const expired = harness();
    const created = await expired.service.createSession({
      verifiedIdentity: verified,
      identityResolution: resolution,
    });
    expired.setClock(new Date('2026-01-01T00:05:00.001Z'));
    expect(await expired.service.validateSession(created.rawToken)).toEqual({
      authenticated: false,
      reason: 'expired',
    });
    for (const state of ['suspended', 'disabled'] as const) {
      const h = harness(state);
      const session = await h.service.createSession({
        verifiedIdentity: verified,
        identityResolution: resolution,
      });
      expect(await h.service.validateSession(session.rawToken)).toEqual({
        authenticated: false,
        reason: 'user_inactive',
      });
    }
  });
  it('rotates atomically for elevation and revokes logout', async () => {
    const { repository, service } = harness();
    const first = await service.createSession({
      verifiedIdentity: verified,
      identityResolution: resolution,
    });
    const elevated = await service.rotateSession(first.rawToken);
    expect(elevated.session.assuranceLevel).toBe('single_factor');
    expect(await service.validateSession(first.rawToken)).toEqual({
      authenticated: false,
      reason: 'revoked',
    });
    await service.invalidateSession(elevated.rawToken);
    expect(await service.validateSession(elevated.rawToken)).toEqual({
      authenticated: false,
      reason: 'revoked',
    });
    expect(repository.records.size).toBe(2);
  });
  it('rejects client-forged MFA assurance', async () => {
    const { service } = harness();
    const created = await service.createSession({
      verifiedIdentity: verified,
      identityResolution: resolution,
    });
    expect(() => service.elevateSessionAfterMfa(created.rawToken, {} as never)).toThrowError(
      new SessionError('MFA_CHALLENGE_INVALID'),
    );
  });
  it('enforces secure deployed and local cookie policies', () => {
    const deployed = parseSessionConfiguration({ environment: 'production' });
    const local = parseSessionConfiguration({ environment: 'development' });
    const cookie = createSessionCookie('secret' as RawSessionToken, 99_999, deployed);
    expect(cookie).toMatchObject({
      name: '__Host-habitacores_session',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 86_400,
    });
    expect(createClearedSessionCookie(local)).toMatchObject({
      name: 'habitacores_session',
      value: '',
      secure: false,
      maxAge: 0,
    });
  });
  it('rejects invalid expiration without leaking configuration values', () => {
    expect(() => parseSessionConfiguration({ idleTimeoutSeconds: 0 })).toThrowError(
      new SessionError('INVALID_SESSION_CONFIGURATION'),
    );
    try {
      parseSessionConfiguration({ cookieName: 'credential=value' });
    } catch (error) {
      expect(String(error)).not.toContain('credential=value');
    }
  });
});

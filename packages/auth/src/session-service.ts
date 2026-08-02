import { SessionError } from './errors.js';
import type { SecurityIdGenerator, UserId } from './identifiers.js';
import type { IdentityRepository } from './repository.js';
import { assertVerifiedMfaElevation, type VerifiedMfaElevation } from './mfa-elevation.js';
import type { SessionConfiguration } from './session-config.js';
import type { SessionTokenCrypto } from './session-crypto.js';
import type { SessionRepository } from './session-repository.js';
import type {
  AuthenticatedSession,
  CreatedSession,
  PersistedSession,
  RawSessionToken,
  SessionAssuranceLevel,
  SessionCreationRequest,
  SessionInvalidationReason,
  SessionValidationResult,
} from './session-types.js';

function publicSession(session: PersistedSession): AuthenticatedSession {
  const { lookupDigest: _lookupDigest, ...authenticated } = session;
  void _lookupDigest;
  return authenticated;
}

export class SessionService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly identities: IdentityRepository,
    private readonly tokenCrypto: SessionTokenCrypto,
    private readonly ids: SecurityIdGenerator,
    private readonly configuration: SessionConfiguration,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private buildSession(
    userId: UserId,
    authenticationMethod: PersistedSession['authenticationMethod'],
    assuranceLevel: SessionAssuranceLevel,
    ipHash: string | null,
    userAgentHash: string | null,
  ): CreatedSession & { readonly persisted: PersistedSession } {
    const createdAt = this.now();
    const absoluteExpiresAt = new Date(
      createdAt.getTime() + this.configuration.absoluteTimeoutSeconds * 1_000,
    );
    const expiresAt = new Date(
      Math.min(
        createdAt.getTime() + this.configuration.idleTimeoutSeconds * 1_000,
        absoluteExpiresAt.getTime(),
      ),
    );
    const rawToken = this.tokenCrypto.generateToken();
    const persisted: PersistedSession = {
      kind: 'habitacores-authenticated-session',
      id: this.ids.createSessionId(),
      userId,
      lookupDigest: this.tokenCrypto.digestToken(rawToken),
      status: 'active',
      authenticationMethod,
      assuranceLevel,
      createdAt,
      lastSeenAt: createdAt,
      expiresAt,
      absoluteExpiresAt,
      revokedAt: null,
      revocationReason: null,
      replacedBySessionId: null,
      ipHash,
      userAgentHash,
    };
    return { persisted, session: publicSession(persisted), rawToken };
  }

  async createSession(request: SessionCreationRequest): Promise<CreatedSession> {
    const { verifiedIdentity, identityResolution } = request;
    const authentication = identityResolution.authentication;
    if (
      identityResolution.user.lifecycleStatus !== 'active' ||
      !verifiedIdentity.authenticationMethod ||
      authentication.authenticationMethod !== verifiedIdentity.authenticationMethod ||
      authentication.userId !== identityResolution.user.id ||
      authentication.provider !== verifiedIdentity.provider ||
      authentication.providerSubject !== verifiedIdentity.subject
    ) {
      throw new SessionError('INVALID_SESSION');
    }

    const candidate = this.buildSession(
      identityResolution.user.id,
      verifiedIdentity.authenticationMethod,
      'single_factor',
      request.ipHash ?? null,
      request.userAgentHash ?? null,
    );
    const persisted = await this.sessions.createSession(candidate.persisted);
    return { session: publicSession(persisted), rawToken: candidate.rawToken };
  }

  async validateSession(
    token: RawSessionToken | null,
    minimumAssurance: SessionAssuranceLevel = 'single_factor',
  ): Promise<SessionValidationResult> {
    if (!token) return { authenticated: false, reason: 'missing' };
    const digest = this.tokenCrypto.digestToken(token);
    const session = await this.sessions.findSessionByTokenDigest(digest);
    if (!session || !this.tokenCrypto.matchesDigest(token, session.lookupDigest)) {
      return { authenticated: false, reason: 'invalid' };
    }
    if (session.status === 'revoked' || session.revokedAt) {
      return { authenticated: false, reason: 'revoked' };
    }
    const now = this.now();
    if (
      session.status === 'expired' ||
      session.expiresAt.getTime() <= now.getTime() ||
      session.absoluteExpiresAt.getTime() <= now.getTime()
    ) {
      await this.sessions.revokeSession(session.id, 'expired', now);
      return { authenticated: false, reason: 'expired' };
    }
    const user = await this.identities.findUserById(session.userId);
    if (!user || user.lifecycleStatus !== 'active') {
      const reason = user?.lifecycleStatus === 'suspended' ? 'user_suspended' : 'user_disabled';
      await this.sessions.revokeAllSessionsForUser(session.userId, reason, now);
      return { authenticated: false, reason: 'user_inactive' };
    }
    if (minimumAssurance === 'multi_factor' && session.assuranceLevel !== 'multi_factor') {
      return { authenticated: false, reason: 'insufficient_assurance' };
    }
    const nextExpiry = new Date(
      Math.min(
        now.getTime() + this.configuration.idleTimeoutSeconds * 1_000,
        session.absoluteExpiresAt.getTime(),
      ),
    );
    await this.sessions.updateLastSeen(session.id, session.lastSeenAt, now, nextExpiry);
    return {
      authenticated: true,
      session: publicSession({ ...session, lastSeenAt: now, expiresAt: nextExpiry }),
      user,
    };
  }

  private async rotate(
    token: RawSessionToken,
    assuranceLevel: SessionAssuranceLevel | null,
  ): Promise<CreatedSession> {
    const validated = await this.validateSession(token);
    if (!validated.authenticated) throw new SessionError('INVALID_SESSION');
    const candidate = this.buildSession(
      validated.session.userId,
      validated.session.authenticationMethod,
      assuranceLevel ?? validated.session.assuranceLevel,
      validated.session.ipHash,
      validated.session.userAgentHash,
    );
    if (!(await this.sessions.rotateSession(validated.session.id, candidate.persisted))) {
      throw new SessionError('SESSION_CONFLICT');
    }
    return { session: candidate.session, rawToken: candidate.rawToken };
  }

  rotateSession(token: RawSessionToken): Promise<CreatedSession> {
    return this.rotate(token, null);
  }

  elevateSessionAfterMfa(
    token: RawSessionToken,
    proof: VerifiedMfaElevation,
  ): Promise<CreatedSession> {
    assertVerifiedMfaElevation(proof);
    return this.rotate(token, 'multi_factor');
  }

  async invalidateSession(
    token: RawSessionToken,
    reason: SessionInvalidationReason = 'logout',
  ): Promise<void> {
    const digest = this.tokenCrypto.digestToken(token);
    const session = await this.sessions.findSessionByTokenDigest(digest);
    if (session && this.tokenCrypto.matchesDigest(token, session.lookupDigest)) {
      await this.sessions.revokeSession(session.id, reason, this.now());
    }
  }

  revokeAllSessionsForUser(userId: UserId, reason: SessionInvalidationReason): Promise<number> {
    return this.sessions.revokeAllSessionsForUser(userId, reason, this.now());
  }
}

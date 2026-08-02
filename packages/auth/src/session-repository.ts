import type { SessionId, UserId } from './identifiers.js';
import type {
  PersistedSession,
  SessionInvalidationReason,
  SessionTokenDigest,
} from './session-types.js';

export interface SessionRepository {
  createSession(session: PersistedSession): Promise<PersistedSession>;
  findSessionByTokenDigest(digest: SessionTokenDigest): Promise<PersistedSession | null>;
  updateLastSeen(
    sessionId: SessionId,
    expectedLastSeenAt: Date,
    lastSeenAt: Date,
    expiresAt: Date,
  ): Promise<boolean>;
  rotateSession(previousSessionId: SessionId, replacement: PersistedSession): Promise<boolean>;
  revokeSession(
    sessionId: SessionId,
    reason: SessionInvalidationReason,
    revokedAt: Date,
  ): Promise<boolean>;
  revokeAllSessionsForUser(
    userId: UserId,
    reason: SessionInvalidationReason,
    revokedAt: Date,
  ): Promise<number>;
  listActiveSessionsForUser(userId: UserId, now: Date): Promise<readonly PersistedSession[]>;
}

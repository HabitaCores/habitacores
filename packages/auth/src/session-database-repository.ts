import type { PoolClient } from 'pg';

import { SessionError } from './errors.js';
import { parseSessionId, parseUserId } from './identifiers.js';
import type { SessionRepository } from './session-repository.js';
import type {
  PersistedSession,
  SessionInvalidationReason,
  SessionTokenDigest,
} from './session-types.js';
import { assertAuthServerOnly } from './server-only.js';

interface SessionRow {
  absolute_expires_at: Date;
  assurance_level: PersistedSession['assuranceLevel'];
  authentication_method: PersistedSession['authenticationMethod'];
  created_at: Date;
  expires_at: Date;
  id: string;
  ip_hash: string | null;
  last_seen_at: Date;
  lookup_digest: string;
  replaced_by_session_id: string | null;
  revocation_reason: SessionInvalidationReason | null;
  revoked_at: Date | null;
  status: PersistedSession['status'];
  user_agent_hash: string | null;
  user_id: string;
}

const SESSION_COLUMNS = `id, user_id, lookup_digest, status, authentication_method,
  assurance_level, created_at, last_seen_at, expires_at, absolute_expires_at,
  revoked_at, revocation_reason, replaced_by_session_id, ip_hash, user_agent_hash`;

function mapSession(row: SessionRow): PersistedSession {
  return {
    kind: 'habitacores-authenticated-session',
    id: parseSessionId(row.id),
    userId: parseUserId(row.user_id),
    lookupDigest: row.lookup_digest as SessionTokenDigest,
    status: row.status,
    authenticationMethod: row.authentication_method,
    assuranceLevel: row.assurance_level,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
    revokedAt: row.revoked_at,
    revocationReason: row.revocation_reason,
    replacedBySessionId: row.replaced_by_session_id
      ? parseSessionId(row.replaced_by_session_id)
      : null,
    ipHash: row.ip_hash,
    userAgentHash: row.user_agent_hash,
  };
}

export interface SessionDatabasePool {
  connect(): Promise<PoolClient>;
}

async function useClient<Result>(
  pool: SessionDatabasePool,
  callback: (client: PoolClient) => Promise<Result>,
): Promise<Result> {
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function values(session: PersistedSession): readonly unknown[] {
  return [
    session.id,
    session.userId,
    session.lookupDigest,
    session.status,
    session.authenticationMethod,
    session.assuranceLevel,
    session.createdAt,
    session.lastSeenAt,
    session.expiresAt,
    session.absoluteExpiresAt,
    session.revokedAt,
    session.revocationReason,
    session.replacedBySessionId,
    session.ipHash,
    session.userAgentHash,
  ];
}

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly pool: SessionDatabasePool) {
    assertAuthServerOnly();
  }

  async createSession(session: PersistedSession): Promise<PersistedSession> {
    return useClient(this.pool, async (client) => {
      const result = await client.query<SessionRow>(
        `insert into authentication_sessions (${SESSION_COLUMNS})
         values (${values(session)
           .map((_, index) => `$${index + 1}`)
           .join(', ')})
         returning ${SESSION_COLUMNS}`,
        [...values(session)],
      );
      const created = result.rows[0];
      if (!created) throw new SessionError('UNEXPECTED_SESSION_FAILURE');
      return mapSession(created);
    });
  }

  async findSessionByTokenDigest(digest: SessionTokenDigest): Promise<PersistedSession | null> {
    return useClient(this.pool, async (client) => {
      const result = await client.query<SessionRow>(
        `select ${SESSION_COLUMNS} from authentication_sessions where lookup_digest = $1`,
        [digest],
      );
      return result.rows[0] ? mapSession(result.rows[0]) : null;
    });
  }

  async updateLastSeen(
    sessionId: PersistedSession['id'],
    expectedLastSeenAt: Date,
    lastSeenAt: Date,
    expiresAt: Date,
  ): Promise<boolean> {
    return useClient(this.pool, async (client) => {
      const result = await client.query(
        `update authentication_sessions set last_seen_at = $3, expires_at = $4
         where id = $1 and status = 'active' and last_seen_at = $2
           and expires_at > $3 and absolute_expires_at > $3`,
        [sessionId, expectedLastSeenAt, lastSeenAt, expiresAt],
      );
      return result.rowCount === 1;
    });
  }

  async rotateSession(
    previousSessionId: PersistedSession['id'],
    replacement: PersistedSession,
  ): Promise<boolean> {
    return useClient(this.pool, async (client) => {
      await client.query('BEGIN');
      try {
        const locked = await client.query<{ id: string }>(
          `select id from authentication_sessions
           where id = $1 and status = 'active' for update`,
          [previousSessionId],
        );
        if (!locked.rows[0]) {
          await client.query('ROLLBACK');
          return false;
        }
        await client.query(
          `insert into authentication_sessions (${SESSION_COLUMNS})
           values (${values(replacement)
             .map((_, index) => `$${index + 1}`)
             .join(', ')})`,
          [...values(replacement)],
        );
        const result = await client.query(
          `update authentication_sessions
           set status = 'revoked', revoked_at = $2, revocation_reason = 'rotated',
               replaced_by_session_id = $3
           where id = $1 and status = 'active'`,
          [previousSessionId, replacement.createdAt, replacement.id],
        );
        await client.query('COMMIT');
        return result.rowCount === 1;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  async revokeSession(
    sessionId: PersistedSession['id'],
    reason: SessionInvalidationReason,
    revokedAt: Date,
  ): Promise<boolean> {
    return useClient(this.pool, async (client) => {
      const result = await client.query(
        `update authentication_sessions
         set status = case when $2 = 'expired' then 'expired' else 'revoked' end,
             revoked_at = $3, revocation_reason = $2
         where id = $1 and status = 'active'`,
        [sessionId, reason, revokedAt],
      );
      return result.rowCount === 1;
    });
  }

  async revokeAllSessionsForUser(
    userId: PersistedSession['userId'],
    reason: SessionInvalidationReason,
    revokedAt: Date,
  ): Promise<number> {
    return useClient(this.pool, async (client) => {
      const result = await client.query(
        `update authentication_sessions set status = 'revoked', revoked_at = $3,
             revocation_reason = $2 where user_id = $1 and status = 'active'`,
        [userId, reason, revokedAt],
      );
      return result.rowCount ?? 0;
    });
  }

  async listActiveSessionsForUser(
    userId: PersistedSession['userId'],
    now: Date,
  ): Promise<readonly PersistedSession[]> {
    return useClient(this.pool, async (client) => {
      const result = await client.query<SessionRow>(
        `select ${SESSION_COLUMNS} from authentication_sessions
         where user_id = $1 and status = 'active' and expires_at > $2
           and absolute_expires_at > $2 order by created_at desc`,
        [userId, now],
      );
      return result.rows.map(mapSession);
    });
  }
}

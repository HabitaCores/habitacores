import type { PoolClient } from 'pg';

import { SessionError } from './errors.js';
import {
  parseMfaChallengeId,
  parseSessionId,
  parseTotpEnrollmentId,
  parseUserId,
} from './identifiers.js';
import type { SessionId } from './identifiers.js';
import type { MfaRepository } from './mfa-repository.js';
import type { MfaChallenge, MfaRecoveryCode } from './mfa-types.js';
import { assertAuthServerOnly } from './server-only.js';
import type { ProtectedTotpSecret, RecoveryCodeHash, TotpEnrollment } from './session-types.js';

interface EnrollmentRow {
  created_at: Date;
  disabled_at: Date | null;
  id: string;
  last_used_at: Date | null;
  secret_ciphertext: string;
  secret_key_version: number;
  status: TotpEnrollment['status'];
  user_id: string;
  verified_at: Date | null;
}
interface RecoveryRow {
  code_hash: string;
  created_at: Date;
  enrollment_id: string;
  used_at: Date | null;
}
interface ChallengeRow {
  attempt_count: number;
  challenge_type: MfaChallenge['challengeType'];
  created_at: Date;
  enrollment_id: string;
  expires_at: Date;
  id: string;
  maximum_attempts: number;
  session_id: string | null;
  status: MfaChallenge['status'];
  user_id: string;
  verified_at: Date | null;
}

const ENROLLMENT_COLUMNS = `id, user_id, status, secret_ciphertext, secret_key_version,
  created_at, verified_at, disabled_at, last_used_at`;
const CHALLENGE_COLUMNS = `id, user_id, session_id, enrollment_id, challenge_type,
  status, created_at, expires_at, verified_at, attempt_count, maximum_attempts`;

function mapEnrollment(row: EnrollmentRow): TotpEnrollment {
  return {
    id: parseTotpEnrollmentId(row.id),
    userId: parseUserId(row.user_id),
    status: row.status,
    secretCiphertext: row.secret_ciphertext as ProtectedTotpSecret,
    secretKeyVersion: row.secret_key_version,
    createdAt: row.created_at,
    verifiedAt: row.verified_at,
    disabledAt: row.disabled_at,
    lastUsedAt: row.last_used_at,
  };
}
function mapRecovery(row: RecoveryRow): MfaRecoveryCode {
  return {
    enrollmentId: parseTotpEnrollmentId(row.enrollment_id),
    codeHash: row.code_hash as RecoveryCodeHash,
    createdAt: row.created_at,
    usedAt: row.used_at,
  };
}
function mapChallenge(row: ChallengeRow): MfaChallenge {
  return {
    id: parseMfaChallengeId(row.id),
    userId: parseUserId(row.user_id),
    sessionId: row.session_id ? parseSessionId(row.session_id) : null,
    enrollmentId: parseTotpEnrollmentId(row.enrollment_id),
    challengeType: row.challenge_type,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    verifiedAt: row.verified_at,
    attemptCount: row.attempt_count,
    maxAttempts: row.maximum_attempts,
  };
}

export interface MfaDatabasePool {
  connect(): Promise<PoolClient>;
}

export class PostgresMfaRepository implements MfaRepository {
  constructor(private readonly pool: MfaDatabasePool) {
    assertAuthServerOnly();
  }

  private async withClient<Result>(
    callback: (client: PoolClient) => Promise<Result>,
  ): Promise<Result> {
    const client = await this.pool.connect();
    try {
      return await callback(client);
    } finally {
      client.release();
    }
  }

  async createTotpEnrollment(
    enrollment: TotpEnrollment,
    codes: readonly MfaRecoveryCode[],
  ): Promise<TotpEnrollment> {
    return this.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const result = await client.query<EnrollmentRow>(
          `insert into totp_enrollments (${ENROLLMENT_COLUMNS})
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning ${ENROLLMENT_COLUMNS}`,
          [
            enrollment.id,
            enrollment.userId,
            enrollment.status,
            enrollment.secretCiphertext,
            enrollment.secretKeyVersion,
            enrollment.createdAt,
            enrollment.verifiedAt,
            enrollment.disabledAt,
            enrollment.lastUsedAt,
          ],
        );
        for (const code of codes) {
          await client.query(
            `insert into mfa_recovery_codes (enrollment_id, code_hash, created_at, used_at)
             values ($1,$2,$3,$4)`,
            [code.enrollmentId, code.codeHash, code.createdAt, code.usedAt],
          );
        }
        await client.query('COMMIT');
        const created = result.rows[0];
        if (!created) throw new SessionError('UNEXPECTED_SESSION_FAILURE');
        return mapEnrollment(created);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  async findTotpEnrollment(id: TotpEnrollment['id']): Promise<TotpEnrollment | null> {
    return this.withClient(async (client) => {
      const result = await client.query<EnrollmentRow>(
        `select ${ENROLLMENT_COLUMNS} from totp_enrollments where id = $1`,
        [id],
      );
      return result.rows[0] ? mapEnrollment(result.rows[0]) : null;
    });
  }
  async findActiveEnrollmentForUser(
    userId: TotpEnrollment['userId'],
  ): Promise<TotpEnrollment | null> {
    return this.withClient(async (client) => {
      const result = await client.query<EnrollmentRow>(
        `select ${ENROLLMENT_COLUMNS} from totp_enrollments
         where user_id = $1 and status = 'active' order by verified_at desc limit 1`,
        [userId],
      );
      return result.rows[0] ? mapEnrollment(result.rows[0]) : null;
    });
  }
  async markTotpEnrollmentVerified(id: TotpEnrollment['id'], at: Date): Promise<boolean> {
    return this.updateEnrollment(
      `update totp_enrollments set status='active', verified_at=$2
       where id=$1 and status='pending' and verified_at is null and disabled_at is null`,
      [id, at],
    );
  }
  async disableTotpEnrollment(id: TotpEnrollment['id'], at: Date): Promise<boolean> {
    return this.updateEnrollment(
      `update totp_enrollments set status='disabled', disabled_at=$2
       where id=$1 and status in ('pending','active') and disabled_at is null`,
      [id, at],
    );
  }
  private async updateEnrollment(sql: string, parameters: readonly unknown[]): Promise<boolean> {
    return this.withClient(
      async (client) => (await client.query(sql, [...parameters])).rowCount === 1,
    );
  }
  async listUnusedRecoveryCodes(id: TotpEnrollment['id']): Promise<readonly MfaRecoveryCode[]> {
    return this.withClient(async (client) => {
      const result = await client.query<RecoveryRow>(
        `select enrollment_id, code_hash, created_at, used_at from mfa_recovery_codes
         where enrollment_id=$1 and used_at is null`,
        [id],
      );
      return result.rows.map(mapRecovery);
    });
  }
  async consumeRecoveryCode(
    id: TotpEnrollment['id'],
    hash: RecoveryCodeHash,
    at: Date,
  ): Promise<boolean> {
    return this.withClient(
      async (client) =>
        (
          await client.query(
            `update mfa_recovery_codes set used_at=$3
       where enrollment_id=$1 and code_hash=$2 and used_at is null`,
            [id, hash, at],
          )
        ).rowCount === 1,
    );
  }
  async createChallenge(challenge: MfaChallenge): Promise<MfaChallenge> {
    return this.withClient(async (client) => {
      const result = await client.query<ChallengeRow>(
        `insert into mfa_challenges (${CHALLENGE_COLUMNS})
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning ${CHALLENGE_COLUMNS}`,
        [
          challenge.id,
          challenge.userId,
          challenge.sessionId,
          challenge.enrollmentId,
          challenge.challengeType,
          challenge.status,
          challenge.createdAt,
          challenge.expiresAt,
          challenge.verifiedAt,
          challenge.attemptCount,
          challenge.maxAttempts,
        ],
      );
      const created = result.rows[0];
      if (!created) throw new SessionError('UNEXPECTED_SESSION_FAILURE');
      return mapChallenge(created);
    });
  }
  async findChallenge(id: MfaChallenge['id']): Promise<MfaChallenge | null> {
    return this.withClient(async (client) => {
      const result = await client.query<ChallengeRow>(
        `select ${CHALLENGE_COLUMNS} from mfa_challenges where id=$1`,
        [id],
      );
      return result.rows[0] ? mapChallenge(result.rows[0]) : null;
    });
  }
  async recordFailedChallengeAttempt(
    id: MfaChallenge['id'],
    at: Date,
  ): Promise<MfaChallenge | null> {
    return this.withClient(async (client) => {
      const result = await client.query<ChallengeRow>(
        `update mfa_challenges set attempt_count=attempt_count+1,
           status=case when attempt_count+1 >= maximum_attempts then 'failed' else status end
         where id=$1 and status='pending' and expires_at>$2 and attempt_count<maximum_attempts
         returning ${CHALLENGE_COLUMNS}`,
        [id, at],
      );
      return result.rows[0] ? mapChallenge(result.rows[0]) : null;
    });
  }
  async verifyChallenge(id: MfaChallenge['id'], at: Date): Promise<boolean> {
    return this.withClient(
      async (client) =>
        (
          await client.query(
            `update mfa_challenges set status='verified', verified_at=$2
       where id=$1 and status='pending' and expires_at>$2 and attempt_count<maximum_attempts`,
            [id, at],
          )
        ).rowCount === 1,
    );
  }
  async expireChallenge(id: MfaChallenge['id'], at: Date): Promise<boolean> {
    return this.withClient(
      async (client) =>
        (
          await client.query(
            `update mfa_challenges set status='expired' where id=$1 and status='pending' and expires_at<=$2`,
            [id, at],
          )
        ).rowCount === 1,
    );
  }
  async touchEnrollment(id: TotpEnrollment['id'], at: Date): Promise<void> {
    await this.withClient(async (client) => {
      await client.query(
        `update totp_enrollments set last_used_at=$2 where id=$1 and status='active'`,
        [id, at],
      );
    });
  }
  async invalidateChallengesForSession(sessionId: SessionId, at: Date): Promise<number> {
    return this.withClient(
      async (client) =>
        (
          await client.query(
            `update mfa_challenges set status='expired'
       where session_id=$1 and status='pending' and expires_at>$2`,
            [sessionId, at],
          )
        ).rowCount ?? 0,
    );
  }
}

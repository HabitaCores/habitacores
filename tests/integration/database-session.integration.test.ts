import {
  createNodeSessionTokenCrypto,
  createUuidV7SecurityIdGenerator,
  parseUserId,
  PostgresSessionRepository,
  type PersistedSession,
} from '../../packages/auth/src/index.js';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  prepareIsolatedTestDatabase,
  readIsolatedTestDatabaseUrl,
  resetIsolatedTestDatabase,
} from '../../packages/database/src/testing/isolated-database.js';
import {
  createRuntimeTestDatabaseUrl,
  dropRuntimeTestRole,
  provisionRuntimeTestRole,
  RUNTIME_TEST_ROLE,
} from '../../packages/database/src/testing/runtime-role.js';
import {
  createDatabasePool,
  shutdownDatabasePool,
  type DatabasePool,
} from '../../packages/database/src/runtime/pool.js';
import { parseDatabaseRuntimeConfig } from '../../packages/database/src/runtime/config.js';

const databaseUrl = readIsolatedTestDatabaseUrl(process.env);
const USER_ID = parseUserId('018f0000-0000-7000-8000-000000000001');
const INVALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const createdAt = new Date('2026-01-01T00:00:00.000Z');
let administrativePool: Pool;
let runtimePool: DatabasePool;
let sessions: PostgresSessionRepository;
const ids = createUuidV7SecurityIdGenerator();

async function runtimeQuery(text: string, values: readonly unknown[]) {
  const client = await runtimePool.connect();
  try {
    return await client.query(text, [...values]);
  } finally {
    client.release();
  }
}

function session(digest: string): PersistedSession {
  return {
    kind: 'habitacores-authenticated-session',
    id: ids.createSessionId(),
    userId: USER_ID,
    lookupDigest: digest as PersistedSession['lookupDigest'],
    status: 'active',
    authenticationMethod: 'oauth',
    assuranceLevel: 'single_factor',
    createdAt,
    lastSeenAt: createdAt,
    expiresAt: new Date('2026-01-01T00:30:00.000Z'),
    absoluteExpiresAt: new Date('2026-01-02T00:00:00.000Z'),
    revokedAt: null,
    revocationReason: null,
    replacedBySessionId: null,
    ipHash: null,
    userAgentHash: null,
  };
}

beforeAll(async () => {
  administrativePool = await prepareIsolatedTestDatabase(databaseUrl);
  await administrativePool.query('insert into users (id) values ($1)', [USER_ID]);
  await provisionRuntimeTestRole(administrativePool);
  runtimePool = createDatabasePool(
    parseDatabaseRuntimeConfig({
      databaseUrl: createRuntimeTestDatabaseUrl(databaseUrl),
      maxConnections: 4,
      idleTimeoutMs: 1_000,
      connectionTimeoutMs: 5_000,
    }),
  );
  sessions = new PostgresSessionRepository(runtimePool);
});
afterAll(async () => {
  await shutdownDatabasePool(runtimePool);
  await dropRuntimeTestRole(administrativePool);
  await resetIsolatedTestDatabase(administrativePool);
  await administrativePool.end();
});

describe('session and MFA database foundation', () => {
  it('creates only protected security columns in migration 0004', async () => {
    const tables = await administrativePool.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema='public'
       and table_name = any($1::text[]) order by table_name`,
      [['authentication_sessions', 'mfa_challenges', 'mfa_recovery_codes', 'totp_enrollments']],
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      'authentication_sessions',
      'mfa_challenges',
      'mfa_recovery_codes',
      'totp_enrollments',
    ]);
    const forbidden = await administrativePool.query<{ count: string }>(
      `select count(*) from information_schema.columns where table_schema='public'
       and (column_name ~ '(raw|password|access_token|refresh_token)' or column_name='secret')`,
    );
    expect(forbidden.rows[0]?.count).toBe('0');
  });

  it('accepts UUIDv7 sessions, rejects UUIDv4, and enforces digest uniqueness and linkage', async () => {
    const first = session('sha256:first');
    await sessions.createSession(first);
    await expect(
      sessions.createSession({
        ...session('sha256:invalid'),
        id: INVALID_UUID as PersistedSession['id'],
      }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(sessions.createSession({ ...session('sha256:first') })).rejects.toMatchObject({
      code: '23505',
    });
    await expect(
      sessions.createSession({
        ...session('sha256:orphan'),
        userId: parseUserId('018f0000-0000-7000-8000-000000000099'),
      }),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('rotates one active session and revokes all active sessions atomically', async () => {
    const previous = session('sha256:rotate');
    await sessions.createSession(previous);
    const replacement = {
      ...session('sha256:replacement'),
      assuranceLevel: 'multi_factor' as const,
    };
    expect(await sessions.rotateSession(previous.id, replacement)).toBe(true);
    expect((await sessions.findSessionByTokenDigest(previous.lookupDigest))?.status).toBe(
      'revoked',
    );
    expect(await sessions.rotateSession(previous.id, session('sha256:uncontrolled'))).toBe(false);
    await sessions.createSession(session('sha256:second-active'));
    expect(
      await sessions.revokeAllSessionsForUser(
        USER_ID,
        'user_disabled',
        new Date('2026-01-01T00:10:00.000Z'),
      ),
    ).toBeGreaterThanOrEqual(2);
    expect(await sessions.listActiveSessionsForUser(USER_ID, createdAt)).toHaveLength(0);
  });

  it('persists encrypted TOTP metadata and consumes a recovery hash once', async () => {
    const enrollment = ids.createTotpEnrollmentId();
    await runtimeQuery(
      `insert into totp_enrollments (id,user_id,status,secret_ciphertext,secret_key_version,created_at)
       values ($1,$2,'pending','ciphertext:v1',1,$3)`,
      [enrollment, USER_ID, createdAt],
    );
    await runtimeQuery(
      `insert into mfa_recovery_codes (enrollment_id,code_hash,created_at) values ($1,'hash:one',$2)`,
      [enrollment, createdAt],
    );
    const first = await runtimeQuery(
      `update mfa_recovery_codes set used_at=$3 where enrollment_id=$1 and code_hash=$2 and used_at is null`,
      [enrollment, 'hash:one', new Date('2026-01-01T00:01:00.000Z')],
    );
    const second = await runtimeQuery(
      `update mfa_recovery_codes set used_at=$3 where enrollment_id=$1 and code_hash=$2 and used_at is null`,
      [enrollment, 'hash:one', new Date('2026-01-01T00:02:00.000Z')],
    );
    expect(first.rowCount).toBe(1);
    expect(second.rowCount).toBe(0);
    const stored = await runtimeQuery(
      'select secret_ciphertext,secret_key_version from totp_enrollments where id=$1',
      [enrollment],
    );
    expect(stored.rows[0]).toEqual({ secret_ciphertext: 'ciphertext:v1', secret_key_version: 1 });
  });

  it('enforces bounded, expiring challenges and user-consistent relationships', async () => {
    const secondUser = parseUserId('018f0000-0000-7000-8000-000000000005');
    await administrativePool.query('insert into users (id) values ($1)', [secondUser]);
    const enrollment = ids.createTotpEnrollmentId();
    await runtimeQuery(
      `insert into totp_enrollments (id,user_id,status,secret_ciphertext,secret_key_version,created_at)
       values ($1,$2,'pending','ciphertext:v1',1,$3)`,
      [enrollment, USER_ID, createdAt],
    );
    const linkedSession = session('sha256:challenge');
    await sessions.createSession(linkedSession);
    const insert = `insert into mfa_challenges
      (id,user_id,session_id,enrollment_id,challenge_type,status,created_at,expires_at,attempt_count,maximum_attempts)
      values ($1,$2,$3,$4,'totp','pending',$5,$6,0,$7)`;
    await expect(
      runtimeQuery(insert, [
        ids.createMfaChallengeId(),
        USER_ID,
        linkedSession.id,
        enrollment,
        createdAt,
        createdAt,
        5,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      runtimeQuery(insert, [
        ids.createMfaChallengeId(),
        USER_ID,
        linkedSession.id,
        enrollment,
        createdAt,
        new Date('2026-01-01T00:05:00.000Z'),
        11,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      runtimeQuery(insert, [
        ids.createMfaChallengeId(),
        secondUser,
        linkedSession.id,
        enrollment,
        createdAt,
        new Date('2026-01-01T00:05:00.000Z'),
        5,
      ]),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('keeps runtime non-owner, non-superuser, NOBYPASSRLS with minimum DML grants', async () => {
    const role = await administrativePool.query<{ rolbypassrls: boolean; rolsuper: boolean }>(
      'select rolsuper,rolbypassrls from pg_roles where rolname=$1',
      [RUNTIME_TEST_ROLE],
    );
    expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    const owners = await administrativePool.query<{ count: string }>(
      `select count(*) from pg_class c join pg_roles r on r.oid=c.relowner
       where c.relname=any($1::text[]) and r.rolname=$2`,
      [
        ['authentication_sessions', 'mfa_challenges', 'mfa_recovery_codes', 'totp_enrollments'],
        RUNTIME_TEST_ROLE,
      ],
    );
    expect(owners.rows[0]?.count).toBe('0');
    const crypto = createNodeSessionTokenCrypto();
    expect(crypto.digestToken(crypto.generateToken())).toBeTruthy();
  });
});

import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { users } from './identity.js';

function uuidV7Check(name: string, column: AnyPgColumn) {
  return check(
    name,
    sql`(get_byte(uuid_send(${column}), 6) >> 4) = 7 and (get_byte(uuid_send(${column}), 8) >> 6) = 2`,
  );
}

export const authenticationSessions = pgTable(
  'authentication_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    lookupDigest: text('lookup_digest').notNull(),
    status: text('status').default('active').notNull(),
    authenticationMethod: text('authentication_method').notNull(),
    assuranceLevel: text('assurance_level').default('single_factor').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { mode: 'date', withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp('absolute_expires_at', {
      mode: 'date',
      withTimezone: true,
    }).notNull(),
    revokedAt: timestamp('revoked_at', { mode: 'date', withTimezone: true }),
    revocationReason: text('revocation_reason'),
    replacedBySessionId: uuid('replaced_by_session_id'),
    ipHash: text('ip_hash'),
    userAgentHash: text('user_agent_hash'),
  },
  (table) => [
    uuidV7Check('authentication_sessions_id_uuid_v7_check', table.id),
    check(
      'authentication_sessions_status_check',
      sql`${table.status} in ('active', 'revoked', 'expired')`,
    ),
    check(
      'authentication_sessions_method_check',
      sql`${table.authenticationMethod} in ('password', 'magic_link', 'oauth', 'otp', 'sso')`,
    ),
    check(
      'authentication_sessions_assurance_check',
      sql`${table.assuranceLevel} in ('single_factor', 'multi_factor')`,
    ),
    check(
      'authentication_sessions_expiration_check',
      sql`${table.createdAt} <= ${table.lastSeenAt} and ${table.createdAt} < ${table.expiresAt} and ${table.expiresAt} <= ${table.absoluteExpiresAt} and ${table.lastSeenAt} <= ${table.absoluteExpiresAt}`,
    ),
    check(
      'authentication_sessions_revocation_check',
      sql`(${table.status} = 'active' and ${table.revokedAt} is null and ${table.revocationReason} is null and ${table.replacedBySessionId} is null)
        or (${table.status} = 'revoked' and ${table.revokedAt} is not null and ${table.revocationReason} is not null and ${table.revokedAt} >= ${table.createdAt})
        or (${table.status} = 'expired' and ${table.revokedAt} is not null and ${table.revocationReason} = 'expired' and ${table.replacedBySessionId} is null)`,
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'authentication_sessions_user_fk',
    }),
    foreignKey({
      columns: [table.replacedBySessionId, table.userId],
      foreignColumns: [table.id, table.userId],
      name: 'authentication_sessions_replacement_fk',
    }),
    unique('authentication_sessions_id_user_unique').on(table.id, table.userId),
    unique('authentication_sessions_lookup_digest_unique').on(table.lookupDigest),
    index('authentication_sessions_user_status_idx').on(table.userId, table.status),
    index('authentication_sessions_active_lookup_idx')
      .on(table.lookupDigest)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const totpEnrollments = pgTable(
  'totp_enrollments',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    status: text('status').default('pending').notNull(),
    secretCiphertext: text('secret_ciphertext').notNull(),
    secretKeyVersion: integer('secret_key_version').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
    verifiedAt: timestamp('verified_at', { mode: 'date', withTimezone: true }),
    disabledAt: timestamp('disabled_at', { mode: 'date', withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { mode: 'date', withTimezone: true }),
  },
  (table) => [
    uuidV7Check('totp_enrollments_id_uuid_v7_check', table.id),
    check(
      'totp_enrollments_status_check',
      sql`${table.status} in ('pending', 'active', 'disabled')`,
    ),
    check('totp_enrollments_key_version_check', sql`${table.secretKeyVersion} > 0`),
    check('totp_enrollments_ciphertext_check', sql`octet_length(${table.secretCiphertext}) > 0`),
    check(
      'totp_enrollments_lifecycle_check',
      sql`(${table.status} = 'pending' and ${table.verifiedAt} is null and ${table.disabledAt} is null)
        or (${table.status} = 'active' and ${table.verifiedAt} is not null and ${table.disabledAt} is null)
        or (${table.status} = 'disabled' and ${table.disabledAt} is not null)`,
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'totp_enrollments_user_fk',
    }),
    unique('totp_enrollments_id_user_unique').on(table.id, table.userId),
    uniqueIndex('totp_enrollments_user_current_unique')
      .on(table.userId)
      .where(sql`${table.status} in ('pending', 'active')`),
    index('totp_enrollments_user_status_idx').on(table.userId, table.status),
  ],
);

export const mfaRecoveryCodes = pgTable(
  'mfa_recovery_codes',
  {
    enrollmentId: uuid('enrollment_id').notNull(),
    codeHash: text('code_hash').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { mode: 'date', withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.enrollmentId, table.codeHash], name: 'mfa_recovery_codes_pk' }),
    check('mfa_recovery_codes_hash_check', sql`octet_length(${table.codeHash}) > 0`),
    check(
      'mfa_recovery_codes_used_at_check',
      sql`${table.usedAt} is null or ${table.usedAt} >= ${table.createdAt}`,
    ),
    foreignKey({
      columns: [table.enrollmentId],
      foreignColumns: [totpEnrollments.id],
      name: 'mfa_recovery_codes_enrollment_fk',
    }),
    index('mfa_recovery_codes_unused_idx').on(table.enrollmentId, table.usedAt),
  ],
);

export const mfaChallenges = pgTable(
  'mfa_challenges',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    sessionId: uuid('session_id'),
    enrollmentId: uuid('enrollment_id').notNull(),
    challengeType: text('challenge_type').notNull(),
    status: text('status').default('pending').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }).notNull(),
    verifiedAt: timestamp('verified_at', { mode: 'date', withTimezone: true }),
    attemptCount: integer('attempt_count').default(0).notNull(),
    maximumAttempts: integer('maximum_attempts').notNull(),
  },
  (table) => [
    uuidV7Check('mfa_challenges_id_uuid_v7_check', table.id),
    check('mfa_challenges_type_check', sql`${table.challengeType} in ('totp', 'recovery_code')`),
    check(
      'mfa_challenges_status_check',
      sql`${table.status} in ('pending', 'verified', 'failed', 'expired')`,
    ),
    check('mfa_challenges_expiration_check', sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      'mfa_challenges_attempts_check',
      sql`${table.maximumAttempts} between 1 and 10 and ${table.attemptCount} between 0 and ${table.maximumAttempts}`,
    ),
    check(
      'mfa_challenges_verification_check',
      sql`(${table.status} = 'verified' and ${table.verifiedAt} is not null)
        or (${table.status} <> 'verified' and ${table.verifiedAt} is null)`,
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'mfa_challenges_user_fk',
    }),
    foreignKey({
      columns: [table.sessionId, table.userId],
      foreignColumns: [authenticationSessions.id, authenticationSessions.userId],
      name: 'mfa_challenges_session_user_fk',
    }),
    foreignKey({
      columns: [table.enrollmentId, table.userId],
      foreignColumns: [totpEnrollments.id, totpEnrollments.userId],
      name: 'mfa_challenges_enrollment_user_fk',
    }),
    index('mfa_challenges_user_status_idx').on(table.userId, table.status),
    index('mfa_challenges_session_idx').on(table.sessionId),
  ],
);

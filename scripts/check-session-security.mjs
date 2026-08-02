import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve('drizzle/migrations/0004_secure_sessions_totp_mfa.sql'),
  'utf8',
);
const required = [
  'authentication_sessions',
  'lookup_digest',
  'authentication_sessions_lookup_digest_unique',
  'totp_enrollments',
  'secret_ciphertext',
  'secret_key_version',
  'mfa_recovery_codes',
  'mfa_challenges',
  'maximum_attempts',
  'uuid_v7_check',
];
const forbiddenColumns = [
  /"raw_[^"]*"/i,
  /"password[^"]*"/i,
  /"access_token"/i,
  /"refresh_token"/i,
  /"secret"\s/i,
];
const failures = [
  ...required
    .filter((value) => !migration.includes(value))
    .map((value) => `Migration is missing ${value}.`),
  ...forbiddenColumns
    .filter((pattern) => pattern.test(migration))
    .map((pattern) => `Migration contains forbidden plaintext column pattern ${pattern}.`),
];
if (/grant\s+.*\s+to\s+public/i.test(migration))
  failures.push('Migration grants security tables to PUBLIC.');
if (failures.length) {
  console.error('Session security validation failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Session security validation passed.');

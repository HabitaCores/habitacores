import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationPath = 'drizzle/migrations/0002_authentication_identity.sql';
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const sql = readFileSync(resolve(repositoryRoot, migrationPath), 'utf8');
const errors = [];

function requireMatch(pattern, message) {
  if (!pattern.test(sql)) {
    errors.push(message);
  }
}

for (const table of ['users', 'external_identity_links']) {
  requireMatch(new RegExp(`create table "${table}"`, 'i'), `Missing ${table} table.`);
}

for (const constraint of [
  'users_id_uuid_v7_check',
  'users_lifecycle_status_check',
  'external_identity_links_id_uuid_v7_check',
  'external_identity_links_provider_check',
  'external_identity_links_provider_subject_unique',
  'external_identity_links_user_fk',
]) {
  requireMatch(new RegExp(`"${constraint}"`, 'i'), `Missing ${constraint} constraint.`);
}

requireMatch(
  /create index "external_identity_links_user_id_idx"/i,
  'Missing identity-link user lookup index.',
);
requireMatch(/timestamp with time zone/gi, 'Identity timestamps must include time zone.');

const forbiddenPatterns = [
  [
    /"(?:password|password_hash|access_token|refresh_token|mfa_secret)"/i,
    'Credential column found.',
  ],
  [/"(?:anon_key|service_role_key)"/i, 'Provider credential column found.'],
  [/create table "(?:memberships|roles|permissions)"/i, 'Authorization table found.'],
  [/grant [\s\S]* to public/i, 'PUBLIC grant found.'],
  [/enable row level security/i, 'Organization RLS was copied onto global identity tables.'],
  [/postgres(?:ql)?:\/\//i, 'Connection string found.'],
];

for (const [pattern, message] of forbiddenPatterns) {
  if (pattern.test(sql)) {
    errors.push(message);
  }
}

if (errors.length > 0) {
  console.error('\nAuthentication migration validation failed:\n');

  for (const error of errors) {
    console.error(`- ${error}`);
  }

  process.exit(1);
}

console.log(`Authentication migration validation passed for ${migrationPath}.`);

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationPath = 'drizzle/migrations/0001_organization_rls.sql';
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const sql = readFileSync(resolve(repositoryRoot, migrationPath), 'utf8');
const protectedTables = [
  'organizations',
  'properties',
  'communities',
  'buildings',
  'blocks',
  'floors',
  'units',
];
const operations = ['select', 'insert', 'update', 'delete'];
const errors = [];

function requireMatch(pattern, message) {
  if (!pattern.test(sql)) {
    errors.push(message);
  }
}

requireMatch(/create schema if not exists "habitacores";/i, 'Application schema is missing.');
requireMatch(
  /current_setting\('habitacores\.organization_id', true\)/i,
  'Helper must use current_setting with missing_ok.',
);
requireMatch(/returns uuid/i, 'Helper must return PostgreSQL uuid.');
requireMatch(
  /revoke all on function "habitacores"\."current_organization_id"\(\) from public;/i,
  'PUBLIC function execution must be revoked.',
);

for (const table of protectedTables) {
  requireMatch(
    new RegExp(`alter table "public"\\."${table}" enable row level security;`, 'i'),
    `${table} must enable RLS.`,
  );
  requireMatch(
    new RegExp(`alter table "public"\\."${table}" force row level security;`, 'i'),
    `${table} must force RLS.`,
  );

  for (const operation of operations) {
    requireMatch(
      new RegExp(
        `create policy "${table}_organization_${operation}"[\\s\\S]*?for ${operation}`,
        'i',
      ),
      `${table} is missing its ${operation.toUpperCase()} policy.`,
    );
  }
}

const policyCount = sql.match(/create policy /gi)?.length ?? 0;

if (policyCount !== protectedTables.length * operations.length) {
  errors.push(`Expected 28 explicit policies, found ${policyCount}.`);
}

const forbiddenPatterns = [
  [/\bcreate role\b/i, 'Runtime roles must not be created by the application migration.'],
  [/\bbypassrls\b/i, 'The migration must not grant BYPASSRLS.'],
  [/\bpassword\b/i, 'The migration must not contain credentials.'],
  [/postgres(?:ql)?:\/\//i, 'The migration must not contain connection strings.'],
  [/\bsupabase\b/i, 'The migration must not reference Supabase.'],
  [/\bdynamic\s+sql\b/i, 'The migration must not use dynamic SQL.'],
];

for (const [pattern, message] of forbiddenPatterns) {
  if (pattern.test(sql)) {
    errors.push(message);
  }
}

if (errors.length > 0) {
  console.error('\nRLS migration validation failed:\n');

  for (const error of errors) {
    console.error(`- ${error}`);
  }

  process.exit(1);
}

console.log(`RLS migration validation passed for ${migrationPath}.`);

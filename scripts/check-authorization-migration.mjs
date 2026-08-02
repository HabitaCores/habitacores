import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationPath = 'drizzle/migrations/0003_organization_authorization.sql';
const root = fileURLToPath(new URL('../', import.meta.url));
const sql = readFileSync(resolve(root, migrationPath), 'utf8');
const errors = [];
const scopedTables = [
  'organization_memberships',
  'roles',
  'membership_role_assignments',
  'role_permissions',
];

function requireMatch(pattern, message) {
  if (!pattern.test(sql)) errors.push(message);
}

for (const table of [
  'organization_memberships',
  'roles',
  'permissions',
  'role_permissions',
  'membership_role_assignments',
]) {
  requireMatch(new RegExp(`create table "${table}"`, 'i'), `Missing ${table} table.`);
}

for (const constraint of [
  'organization_memberships_id_uuid_v7_check',
  'roles_id_uuid_v7_check',
  'permissions_id_uuid_v7_check',
  'membership_role_assignments_id_uuid_v7_check',
  'membership_role_assignments_membership_tenant_fk',
  'membership_role_assignments_role_tenant_fk',
  'membership_role_assignments_active_unique',
  'role_permissions_active_unique',
]) {
  requireMatch(new RegExp(`"${constraint}"`, 'i'), `Missing ${constraint}.`);
}

for (const table of scopedTables) {
  requireMatch(
    new RegExp(`alter table "public"\\."${table}" enable row level security`, 'i'),
    `${table} must enable RLS.`,
  );
  requireMatch(
    new RegExp(`alter table "public"\\."${table}" force row level security`, 'i'),
    `${table} must force RLS.`,
  );
  for (const operation of ['select', 'insert', 'update', 'delete']) {
    requireMatch(
      new RegExp(
        `create policy "${table}_organization_${operation}"[\\s\\S]*?for ${operation}`,
        'i',
      ),
      `${table} is missing its ${operation.toUpperCase()} policy.`,
    );
  }
}

requireMatch(
  /role_permissions[\s\S]*exists[\s\S]*current_organization_id/i,
  'Role-derived policy is missing.',
);
requireMatch(
  /'organization\.read'[\s\S]*'property\.manage'/i,
  'Provisional permission seed is incomplete.',
);

for (const [pattern, message] of [
  [
    /alter table "public"\."permissions" enable row level security/i,
    'Global permissions must not use organization RLS.',
  ],
  [/grant [\s\S]* to public/i, 'PUBLIC grant found.'],
  [/\bcreate role\b/i, 'Migration must not create runtime roles.'],
  [/\bbypassrls\b/i, 'Migration must not grant BYPASSRLS.'],
  [/postgres(?:ql)?:\/\//i, 'Connection string found.'],
  [/\bsupabase\b/i, 'Supabase reference found.'],
  [/\bpassword\b/i, 'Credential-like content found.'],
]) {
  if (pattern.test(sql)) errors.push(message);
}

if (errors.length) {
  console.error('\nAuthorization migration validation failed:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Authorization migration validation passed for ${migrationPath}.`);

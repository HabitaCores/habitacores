import type { Pool } from 'pg';

export const RUNTIME_TEST_ROLE = 'habitacores_runtime_test';

const RUNTIME_TEST_PASSWORD = 'habitacores_runtime_test_only';
const PROTECTED_TABLES = [
  'organizations',
  'properties',
  'communities',
  'buildings',
  'blocks',
  'floors',
  'units',
] as const;
const IDENTITY_TABLES = ['users', 'external_identity_links'] as const;
const AUTHORIZATION_TABLES = [
  'organization_memberships',
  'roles',
  'role_permissions',
  'membership_role_assignments',
] as const;
const GLOBAL_REFERENCE_TABLES = ['permissions'] as const;

export function createRuntimeTestDatabaseUrl(administrativeDatabaseUrl: string): string {
  const url = new URL(administrativeDatabaseUrl);

  url.username = RUNTIME_TEST_ROLE;
  url.password = RUNTIME_TEST_PASSWORD;

  return url.toString();
}

export async function provisionRuntimeTestRole(administrativePool: Pool): Promise<void> {
  await administrativePool.query(`drop role if exists ${RUNTIME_TEST_ROLE}`);
  await administrativePool.query(`
    create role ${RUNTIME_TEST_ROLE}
      login
      password '${RUNTIME_TEST_PASSWORD}'
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      noreplication
      nobypassrls
  `);
  await administrativePool.query(
    `grant usage on schema public, habitacores to ${RUNTIME_TEST_ROLE}`,
  );
  await administrativePool.query(
    `grant execute on function habitacores.current_organization_id() to ${RUNTIME_TEST_ROLE}`,
  );
  await administrativePool.query(
    `grant select, insert, update, delete on table ${PROTECTED_TABLES.join(', ')} to ${RUNTIME_TEST_ROLE}`,
  );
  await administrativePool.query(
    `grant select, insert, update, delete on table ${IDENTITY_TABLES.join(', ')} to ${RUNTIME_TEST_ROLE}`,
  );
  await administrativePool.query(
    `grant select, insert, update, delete on table ${AUTHORIZATION_TABLES.join(', ')} to ${RUNTIME_TEST_ROLE}`,
  );
  await administrativePool.query(
    `grant select on table ${GLOBAL_REFERENCE_TABLES.join(', ')} to ${RUNTIME_TEST_ROLE}`,
  );
}

export async function dropRuntimeTestRole(administrativePool: Pool): Promise<void> {
  await administrativePool.query(`drop owned by ${RUNTIME_TEST_ROLE}`);
  await administrativePool.query(`drop role if exists ${RUNTIME_TEST_ROLE}`);
}

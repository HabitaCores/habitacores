import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  boolean,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { users } from './identity.js';
import { organizations } from './tenancy.js';

const timestamps = {
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
};

function uuidV7Check(name: string, column: AnyPgColumn) {
  return check(
    name,
    sql`(get_byte(uuid_send(${column}), 6) >> 4) = 7 and (get_byte(uuid_send(${column}), 8) >> 6) = 2`,
  );
}

export const organizationMemberships = pgTable(
  'organization_memberships',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    userId: uuid('user_id').notNull(),
    status: text('status').default('invited').notNull(),
    invitedAt: timestamp('invited_at', { mode: 'date', withTimezone: true }).notNull(),
    activatedAt: timestamp('activated_at', { mode: 'date', withTimezone: true }),
    suspendedAt: timestamp('suspended_at', { mode: 'date', withTimezone: true }),
    revokedAt: timestamp('revoked_at', { mode: 'date', withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uuidV7Check('organization_memberships_id_uuid_v7_check', table.id),
    check(
      'organization_memberships_status_check',
      sql`${table.status} in ('invited', 'active', 'suspended', 'revoked')`,
    ),
    check(
      'organization_memberships_lifecycle_timestamps_check',
      sql`(${table.status} = 'invited' and ${table.activatedAt} is null and ${table.suspendedAt} is null and ${table.revokedAt} is null)
        or (${table.status} = 'active' and ${table.activatedAt} is not null and ${table.suspendedAt} is null and ${table.revokedAt} is null)
        or (${table.status} = 'suspended' and ${table.activatedAt} is not null and ${table.suspendedAt} is not null and ${table.revokedAt} is null)
        or (${table.status} = 'revoked' and ${table.revokedAt} is not null)`,
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
      name: 'organization_memberships_organization_fk',
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'organization_memberships_user_fk',
    }),
    unique('organization_memberships_organization_user_unique').on(
      table.organizationId,
      table.userId,
    ),
    unique('organization_memberships_organization_id_id_unique').on(table.organizationId, table.id),
    index('organization_memberships_organization_id_idx').on(table.organizationId),
    index('organization_memberships_user_id_idx').on(table.userId),
  ],
);

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    code: text('code').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    lifecycleStatus: text('lifecycle_status').default('active').notNull(),
    isSystemRole: boolean('is_system_role').default(false).notNull(),
    ...timestamps,
    disabledAt: timestamp('disabled_at', { mode: 'date', withTimezone: true }),
  },
  (table) => [
    uuidV7Check('roles_id_uuid_v7_check', table.id),
    check(
      'roles_code_check',
      sql`${table.code} = lower(trim(${table.code})) and ${table.code} ~ '^[a-z][a-z0-9_]*$'`,
    ),
    check('roles_display_name_check', sql`octet_length(trim(${table.displayName})) > 0`),
    check('roles_lifecycle_status_check', sql`${table.lifecycleStatus} in ('active', 'disabled')`),
    check(
      'roles_disabled_at_check',
      sql`(${table.lifecycleStatus} = 'active' and ${table.disabledAt} is null) or (${table.lifecycleStatus} = 'disabled' and ${table.disabledAt} is not null)`,
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
      name: 'roles_organization_fk',
    }),
    unique('roles_organization_code_unique').on(table.organizationId, table.code),
    unique('roles_organization_id_id_unique').on(table.organizationId, table.id),
    index('roles_organization_id_idx').on(table.organizationId),
  ],
);

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').primaryKey(),
    code: text('code').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    ...timestamps,
  },
  (table) => [
    uuidV7Check('permissions_id_uuid_v7_check', table.id),
    check(
      'permissions_code_check',
      sql`${table.code} = lower(trim(${table.code})) and ${table.code} ~ '^[a-z][a-z0-9_]*([.][a-z][a-z0-9_]*)+$' and position('*' in ${table.code}) = 0`,
    ),
    check('permissions_display_name_check', sql`octet_length(trim(${table.displayName})) > 0`),
    unique('permissions_code_unique').on(table.code),
    index('permissions_code_idx').on(table.code),
  ],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id').notNull(),
    permissionId: uuid('permission_id').notNull(),
    grantedAt: timestamp('granted_at', { mode: 'date', withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { mode: 'date', withTimezone: true }),
  },
  (table) => [
    primaryKey({
      columns: [table.roleId, table.permissionId, table.grantedAt],
      name: 'role_permissions_pk',
    }),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [roles.id],
      name: 'role_permissions_role_fk',
    }),
    foreignKey({
      columns: [table.permissionId],
      foreignColumns: [permissions.id],
      name: 'role_permissions_permission_fk',
    }),
    check(
      'role_permissions_timestamps_check',
      sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.grantedAt}`,
    ),
    uniqueIndex('role_permissions_active_unique')
      .on(table.roleId, table.permissionId)
      .where(sql`${table.revokedAt} is null`),
    index('role_permissions_permission_id_idx').on(table.permissionId),
  ],
);

export const membershipRoleAssignments = pgTable(
  'membership_role_assignments',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
    roleId: uuid('role_id').notNull(),
    lifecycleStatus: text('lifecycle_status').default('active').notNull(),
    assignedAt: timestamp('assigned_at', { mode: 'date', withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { mode: 'date', withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uuidV7Check('membership_role_assignments_id_uuid_v7_check', table.id),
    check(
      'membership_role_assignments_lifecycle_status_check',
      sql`${table.lifecycleStatus} in ('active', 'revoked')`,
    ),
    check(
      'membership_role_assignments_lifecycle_timestamps_check',
      sql`(${table.lifecycleStatus} = 'active' and ${table.revokedAt} is null) or (${table.lifecycleStatus} = 'revoked' and ${table.revokedAt} is not null and ${table.revokedAt} >= ${table.assignedAt})`,
    ),
    foreignKey({
      columns: [table.organizationId, table.membershipId],
      foreignColumns: [organizationMemberships.organizationId, organizationMemberships.id],
      name: 'membership_role_assignments_membership_tenant_fk',
    }),
    foreignKey({
      columns: [table.organizationId, table.roleId],
      foreignColumns: [roles.organizationId, roles.id],
      name: 'membership_role_assignments_role_tenant_fk',
    }),
    unique('membership_role_assignments_organization_id_id_unique').on(
      table.organizationId,
      table.id,
    ),
    uniqueIndex('membership_role_assignments_active_unique')
      .on(table.organizationId, table.membershipId, table.roleId)
      .where(sql`${table.revokedAt} is null`),
    index('membership_role_assignments_organization_membership_idx').on(
      table.organizationId,
      table.membershipId,
    ),
    index('membership_role_assignments_organization_role_idx').on(
      table.organizationId,
      table.roleId,
    ),
  ],
);

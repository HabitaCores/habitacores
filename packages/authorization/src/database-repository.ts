import type { UserId } from '@habitacores/auth';
import { parseUserId } from '@habitacores/auth';
import { parseOrganizationId, type OrganizationId } from '@habitacores/domain';
import type { Pool, QueryResultRow } from 'pg';

import { AuthorizationError } from './errors.js';
import {
  parseMembershipId,
  parseRoleId,
  type MembershipId,
  type PermissionId,
  type RoleAssignmentId,
  type RoleId,
} from './identifiers.js';
import { parsePermissionCode, type PermissionCode } from './permission-code.js';
import type {
  AuthorizationRepository,
  NewOrganizationMembership,
  NewOrganizationRole,
} from './repository.js';
import { assertAuthorizationServerOnly } from './server-only.js';
import type { AuthorizationUserState, OrganizationMembership, OrganizationRole } from './types.js';

interface MembershipRow extends QueryResultRow {
  id: string;
  organization_id: string;
  user_id: string;
  status: OrganizationMembership['status'];
  invited_at: Date;
  activated_at: Date | null;
  suspended_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface RoleRow extends QueryResultRow {
  id: string;
  organization_id: string;
  code: string;
  display_name: string;
  description: string | null;
  lifecycle_status: OrganizationRole['lifecycleStatus'];
  is_system_role: boolean;
  created_at: Date;
  updated_at: Date;
  disabled_at: Date | null;
}

const MEMBERSHIP_COLUMNS = `id, organization_id, user_id, status, invited_at, activated_at,
  suspended_at, revoked_at, created_at, updated_at`;
const ROLE_COLUMNS = `id, organization_id, code, display_name, description, lifecycle_status,
  is_system_role, created_at, updated_at, disabled_at`;

function membership(row: MembershipRow): OrganizationMembership {
  return {
    id: parseMembershipId(row.id),
    organizationId: parseOrganizationId(row.organization_id),
    userId: parseUserId(row.user_id),
    status: row.status,
    invitedAt: row.invited_at,
    activatedAt: row.activated_at,
    suspendedAt: row.suspended_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function role(row: RoleRow): OrganizationRole {
  return {
    id: parseRoleId(row.id),
    organizationId: parseOrganizationId(row.organization_id),
    code: row.code,
    displayName: row.display_name,
    description: row.description,
    lifecycleStatus: row.lifecycle_status,
    isSystemRole: row.is_system_role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    disabledAt: row.disabled_at,
  };
}

function isConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export class PostgresAuthorizationRepository implements AuthorizationRepository {
  constructor(private readonly pool: Pick<Pool, 'query'>) {
    assertAuthorizationServerOnly();
  }

  async findUserState(userId: UserId): Promise<AuthorizationUserState | null> {
    const result = await this.pool.query<{
      id: string;
      lifecycle_status: AuthorizationUserState['lifecycleStatus'];
    }>('select id, lifecycle_status from users where id = $1', [userId]);
    const row = result.rows[0];
    return row ? { id: parseUserId(row.id), lifecycleStatus: row.lifecycle_status } : null;
  }

  async findMembership(
    organizationId: OrganizationId,
    userId: UserId,
  ): Promise<OrganizationMembership | null> {
    const result = await this.pool.query<MembershipRow>(
      `select ${MEMBERSHIP_COLUMNS} from organization_memberships
       where organization_id = $1 and user_id = $2`,
      [organizationId, userId],
    );
    return result.rows[0] ? membership(result.rows[0]) : null;
  }

  async listActiveMemberships(userId: UserId): Promise<readonly OrganizationMembership[]> {
    const result = await this.pool.query<MembershipRow>(
      `select ${MEMBERSHIP_COLUMNS} from organization_memberships
       where user_id = $1 and status = 'active' order by organization_id`,
      [userId],
    );
    return result.rows.map(membership);
  }

  async findRole(organizationId: OrganizationId, roleId: RoleId): Promise<OrganizationRole | null> {
    const result = await this.pool.query<RoleRow>(
      `select ${ROLE_COLUMNS} from roles where organization_id = $1 and id = $2`,
      [organizationId, roleId],
    );
    return result.rows[0] ? role(result.rows[0]) : null;
  }

  async listEffectivePermissions(
    organizationId: OrganizationId,
    membershipId: MembershipId,
  ): Promise<readonly PermissionCode[]> {
    const result = await this.pool.query<{ code: string }>(
      `select distinct p.code
       from membership_role_assignments mra
       join roles r on r.id = mra.role_id and r.organization_id = mra.organization_id
       join role_permissions rp on rp.role_id = r.id and rp.revoked_at is null
       join permissions p on p.id = rp.permission_id
       where mra.organization_id = $1
         and mra.membership_id = $2
         and mra.lifecycle_status = 'active'
         and mra.revoked_at is null
         and r.lifecycle_status = 'active'
       order by p.code`,
      [organizationId, membershipId],
    );
    return result.rows.map(({ code }) => parsePermissionCode(code));
  }

  async createMembership(input: NewOrganizationMembership): Promise<OrganizationMembership> {
    try {
      const result = await this.pool.query<MembershipRow>(
        `insert into organization_memberships
          (id, organization_id, user_id, status, invited_at, activated_at, suspended_at,
           revoked_at, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning ${MEMBERSHIP_COLUMNS}`,
        [
          input.id,
          input.organizationId,
          input.userId,
          input.status,
          input.invitedAt,
          input.activatedAt,
          input.suspendedAt,
          input.revokedAt,
          input.createdAt,
          input.updatedAt,
        ],
      );
      return membership(result.rows[0]!);
    } catch (error) {
      if (isConflict(error)) throw new AuthorizationError('AUTHORIZATION_DATA_CONFLICT');
      throw error;
    }
  }

  async activateMembership(id: MembershipId, changedAt: Date): Promise<void> {
    await this.pool.query(
      `update organization_memberships set status = 'active', activated_at = $2,
       suspended_at = null, revoked_at = null, updated_at = $2
       where id = $1 and status = 'invited'`,
      [id, changedAt],
    );
  }

  async suspendMembership(id: MembershipId, changedAt: Date): Promise<void> {
    await this.pool.query(
      `update organization_memberships set status = 'suspended', suspended_at = $2,
       updated_at = $2 where id = $1 and status = 'active'`,
      [id, changedAt],
    );
  }

  async revokeMembership(id: MembershipId, changedAt: Date): Promise<void> {
    await this.pool.query(
      `update organization_memberships set status = 'revoked', revoked_at = $2,
       updated_at = $2 where id = $1`,
      [id, changedAt],
    );
  }

  async createRole(input: NewOrganizationRole): Promise<OrganizationRole> {
    try {
      const result = await this.pool.query<RoleRow>(
        `insert into roles (id, organization_id, code, display_name, description,
          lifecycle_status, is_system_role, created_at, updated_at, disabled_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning ${ROLE_COLUMNS}`,
        [
          input.id,
          input.organizationId,
          input.code,
          input.displayName,
          input.description,
          input.lifecycleStatus,
          input.isSystemRole,
          input.createdAt,
          input.updatedAt,
          input.disabledAt,
        ],
      );
      return role(result.rows[0]!);
    } catch (error) {
      if (isConflict(error)) throw new AuthorizationError('AUTHORIZATION_DATA_CONFLICT');
      throw error;
    }
  }

  async disableRole(id: RoleId, disabledAt: Date): Promise<void> {
    await this.pool.query(
      `update roles set lifecycle_status = 'disabled', disabled_at = $2, updated_at = $2
       where id = $1 and lifecycle_status = 'active'`,
      [id, disabledAt],
    );
  }

  async assignPermissionToRole(
    roleId: RoleId,
    permissionId: PermissionId,
    assignedAt: Date,
  ): Promise<void> {
    try {
      await this.pool.query(
        'insert into role_permissions (role_id, permission_id, granted_at) values ($1, $2, $3)',
        [roleId, permissionId, assignedAt],
      );
    } catch (error) {
      if (isConflict(error)) throw new AuthorizationError('AUTHORIZATION_DATA_CONFLICT');
      throw error;
    }
  }

  async assignRoleToMembership(input: {
    id: RoleAssignmentId;
    organizationId: OrganizationId;
    membershipId: MembershipId;
    roleId: RoleId;
    assignedAt: Date;
  }): Promise<void> {
    try {
      await this.pool.query(
        `insert into membership_role_assignments
          (id, organization_id, membership_id, role_id, lifecycle_status, assigned_at, created_at, updated_at)
         values ($1,$2,$3,$4,'active',$5,$5,$5)`,
        [input.id, input.organizationId, input.membershipId, input.roleId, input.assignedAt],
      );
    } catch (error) {
      if (isConflict(error)) throw new AuthorizationError('AUTHORIZATION_DATA_CONFLICT');
      throw error;
    }
  }

  async revokeRoleAssignment(id: RoleAssignmentId, revokedAt: Date): Promise<void> {
    await this.pool.query(
      `update membership_role_assignments set lifecycle_status = 'revoked', revoked_at = $2,
       updated_at = $2 where id = $1 and lifecycle_status = 'active'`,
      [id, revokedAt],
    );
  }

  async revokePermissionAssignment(
    roleId: RoleId,
    permissionId: PermissionId,
    revokedAt: Date,
  ): Promise<void> {
    await this.pool.query(
      `update role_permissions set revoked_at = $3 where role_id = $1 and permission_id = $2
       and revoked_at is null`,
      [roleId, permissionId, revokedAt],
    );
  }
}

import type { UserId } from '@habitacores/auth';
import type { OrganizationId } from '@habitacores/domain';

import type { MembershipId, PermissionId, RoleAssignmentId, RoleId } from './identifiers.js';
import type { PermissionCode } from './permission-code.js';
import type { AuthorizationUserState, OrganizationMembership, OrganizationRole } from './types.js';

export type NewOrganizationMembership = OrganizationMembership;
export type NewOrganizationRole = OrganizationRole;

export interface AuthorizationRepository {
  findUserState(userId: UserId): Promise<AuthorizationUserState | null>;
  findMembership(
    organizationId: OrganizationId,
    userId: UserId,
  ): Promise<OrganizationMembership | null>;
  listActiveMemberships(userId: UserId): Promise<readonly OrganizationMembership[]>;
  findRole(organizationId: OrganizationId, roleId: RoleId): Promise<OrganizationRole | null>;
  listEffectivePermissions(
    organizationId: OrganizationId,
    membershipId: MembershipId,
  ): Promise<readonly PermissionCode[]>;
  createMembership(input: NewOrganizationMembership): Promise<OrganizationMembership>;
  activateMembership(membershipId: MembershipId, changedAt: Date): Promise<void>;
  suspendMembership(membershipId: MembershipId, changedAt: Date): Promise<void>;
  revokeMembership(membershipId: MembershipId, changedAt: Date): Promise<void>;
  createRole(input: NewOrganizationRole): Promise<OrganizationRole>;
  disableRole(roleId: RoleId, disabledAt: Date): Promise<void>;
  assignPermissionToRole(
    roleId: RoleId,
    permissionId: PermissionId,
    assignedAt: Date,
  ): Promise<void>;
  assignRoleToMembership(input: {
    id: RoleAssignmentId;
    organizationId: OrganizationId;
    membershipId: MembershipId;
    roleId: RoleId;
    assignedAt: Date;
  }): Promise<void>;
  revokeRoleAssignment(assignmentId: RoleAssignmentId, revokedAt: Date): Promise<void>;
  revokePermissionAssignment(
    roleId: RoleId,
    permissionId: PermissionId,
    revokedAt: Date,
  ): Promise<void>;
}

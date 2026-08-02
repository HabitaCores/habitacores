import type { UserId, UserLifecycleStatus } from '@habitacores/auth';
import type { OrganizationId } from '@habitacores/domain';

import type { AuthorizationDenialReason } from './errors.js';
import type { MembershipId, PermissionId, RoleAssignmentId, RoleId } from './identifiers.js';
import type { PermissionCode } from './permission-code.js';

export type MembershipStatus = 'invited' | 'active' | 'suspended' | 'revoked';
export type RoleLifecycleStatus = 'active' | 'disabled';
export type RoleAssignmentLifecycleStatus = 'active' | 'revoked';

export interface OrganizationMembership {
  readonly id: MembershipId;
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
  readonly status: MembershipStatus;
  readonly invitedAt: Date;
  readonly activatedAt: Date | null;
  readonly suspendedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OrganizationRole {
  readonly id: RoleId;
  readonly organizationId: OrganizationId;
  readonly code: string;
  readonly displayName: string;
  readonly description: string | null;
  readonly lifecycleStatus: RoleLifecycleStatus;
  readonly isSystemRole: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly disabledAt: Date | null;
}

export interface Permission {
  readonly id: PermissionId;
  readonly code: PermissionCode;
  readonly displayName: string;
  readonly description: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RoleAssignment {
  readonly id: RoleAssignmentId;
  readonly organizationId: OrganizationId;
  readonly membershipId: MembershipId;
  readonly roleId: RoleId;
  readonly lifecycleStatus: RoleAssignmentLifecycleStatus;
  readonly assignedAt: Date;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AuthorizationRequest {
  readonly userId: UserId | null;
  readonly organizationId: OrganizationId;
  readonly requiredPermissions: readonly PermissionCode[];
}

export interface AuthorizationUserState {
  readonly id: UserId;
  readonly lifecycleStatus: UserLifecycleStatus;
}

export interface AuthorizedOrganizationContextFields {
  readonly userId: UserId;
  readonly membershipId: MembershipId;
  readonly organizationId: OrganizationId;
  readonly permissions: readonly PermissionCode[];
  readonly authorizedAt: Date;
  readonly metadata: Readonly<{ source: 'organization-authorization-service' }>;
}

export interface AuthorizationGranted {
  readonly granted: true;
  readonly context: import('./authorized-context.js').AuthorizedOrganizationContext;
}

export interface AuthorizationDenied {
  readonly granted: false;
  readonly reason: AuthorizationDenialReason;
}

export type AuthorizationDecision = AuthorizationGranted | AuthorizationDenied;

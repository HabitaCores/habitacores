import { type Brand, InvalidUuidV7Error, isUuidV7 } from '@habitacores/domain';

export type MembershipId = Brand<string, 'MembershipId'>;
export type RoleId = Brand<string, 'RoleId'>;
export type PermissionId = Brand<string, 'PermissionId'>;
export type RoleAssignmentId = Brand<string, 'RoleAssignmentId'>;

function parseAuthorizationId<Identifier extends string>(value: string, type: string): Identifier {
  if (!isUuidV7(value)) {
    throw new InvalidUuidV7Error(type, value);
  }

  return value.toLowerCase() as Identifier;
}

export const parseMembershipId = (value: string): MembershipId =>
  parseAuthorizationId<MembershipId>(value, 'MembershipId');
export const parseRoleId = (value: string): RoleId => parseAuthorizationId<RoleId>(value, 'RoleId');
export const parsePermissionId = (value: string): PermissionId =>
  parseAuthorizationId<PermissionId>(value, 'PermissionId');
export const parseRoleAssignmentId = (value: string): RoleAssignmentId =>
  parseAuthorizationId<RoleAssignmentId>(value, 'RoleAssignmentId');

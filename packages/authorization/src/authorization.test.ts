import { parseUserId, type UserId } from '@habitacores/auth';
import { InvalidUuidV7Error, parseOrganizationId, type OrganizationId } from '@habitacores/domain';
import { describe, expect, it } from 'vitest';

import { AuthorizationError } from './errors.js';
import {
  parseMembershipId,
  parsePermissionId,
  parseRoleAssignmentId,
  parseRoleId,
} from './identifiers.js';
import { OrganizationAuthorizationService } from './authorization-service.js';
import { parsePermissionCode, type PermissionCode } from './permission-code.js';
import type {
  AuthorizationRepository,
  NewOrganizationMembership,
  NewOrganizationRole,
} from './repository.js';
import type { AuthorizationUserState, OrganizationMembership, OrganizationRole } from './types.js';
import { withAuthorizedOrganizationTransaction } from './authorized-transaction.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const USER_ID = parseUserId('01890f47-6c8a-7701-8a21-9b7c1d2e3701');
const ORGANIZATION_ID = parseOrganizationId('01890f47-6c8a-7702-8a21-9b7c1d2e3702');
const OTHER_ORGANIZATION_ID = parseOrganizationId('01890f47-6c8a-7703-8a21-9b7c1d2e3703');
const MEMBERSHIP_ID = parseMembershipId('01890f47-6c8a-7704-8a21-9b7c1d2e3704');
const ROLE_ID = parseRoleId('01890f47-6c8a-7705-8a21-9b7c1d2e3705');
const PERMISSION_ID = parsePermissionId('01890f47-6c8a-7706-8a21-9b7c1d2e3706');
const READ = parsePermissionCode('organization.read');

function activeMembership(
  status: OrganizationMembership['status'] = 'active',
): OrganizationMembership {
  return {
    id: MEMBERSHIP_ID,
    organizationId: ORGANIZATION_ID,
    userId: USER_ID,
    status,
    invitedAt: NOW,
    activatedAt: status === 'invited' ? null : NOW,
    suspendedAt: status === 'suspended' ? NOW : null,
    revokedAt: status === 'revoked' ? NOW : null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

class MemoryRepository implements AuthorizationRepository {
  user: AuthorizationUserState | null = { id: USER_ID, lifecycleStatus: 'active' };
  membership: OrganizationMembership | null = activeMembership();
  permissions: readonly PermissionCode[] = [READ];

  findUserState(): Promise<AuthorizationUserState | null> {
    return Promise.resolve(this.user);
  }
  findMembership(): Promise<OrganizationMembership | null> {
    return Promise.resolve(this.membership);
  }
  listActiveMemberships(): Promise<readonly OrganizationMembership[]> {
    return Promise.resolve(this.membership?.status === 'active' ? [this.membership] : []);
  }
  findRole(): Promise<OrganizationRole | null> {
    return Promise.resolve(null);
  }
  listEffectivePermissions(): Promise<readonly PermissionCode[]> {
    return Promise.resolve(this.permissions);
  }
  createMembership(input: NewOrganizationMembership): Promise<OrganizationMembership> {
    return Promise.resolve(input);
  }
  activateMembership(): Promise<void> {
    return Promise.resolve();
  }
  suspendMembership(): Promise<void> {
    return Promise.resolve();
  }
  revokeMembership(): Promise<void> {
    return Promise.resolve();
  }
  createRole(input: NewOrganizationRole): Promise<OrganizationRole> {
    return Promise.resolve(input);
  }
  disableRole(): Promise<void> {
    return Promise.resolve();
  }
  assignPermissionToRole(): Promise<void> {
    return Promise.resolve();
  }
  assignRoleToMembership(): Promise<void> {
    return Promise.resolve();
  }
  revokeRoleAssignment(): Promise<void> {
    return Promise.resolve();
  }
  revokePermissionAssignment(): Promise<void> {
    return Promise.resolve();
  }
}

function authorize(
  repository: MemoryRepository,
  overrides: Partial<{
    userId: UserId | null;
    organizationId: OrganizationId;
    requiredPermissions: readonly PermissionCode[];
  }> = {},
) {
  return new OrganizationAuthorizationService(repository, () => NOW).authorize({
    userId: USER_ID,
    organizationId: ORGANIZATION_ID,
    requiredPermissions: [READ],
    ...overrides,
  });
}

describe('authorization primitives', () => {
  it('brands only UUIDv7 membership, role, and permission identifiers', () => {
    expect(parseMembershipId(MEMBERSHIP_ID)).toBe(MEMBERSHIP_ID);
    expect(parseRoleId(ROLE_ID)).toBe(ROLE_ID);
    expect(parsePermissionId(PERMISSION_ID)).toBe(PERMISSION_ID);
    expect(parseRoleAssignmentId('01890f47-6c8a-7707-8a21-9b7c1d2e3707')).toBe(
      '01890f47-6c8a-7707-8a21-9b7c1d2e3707',
    );
    expect(() => parseRoleId('550e8400-e29b-41d4-a716-446655440000')).toThrow(InvalidUuidV7Error);
  });

  it('accepts normalized permission codes and rejects wildcard or malformed codes', () => {
    expect(parsePermissionCode('property.manage')).toBe('property.manage');
    expect(() => parsePermissionCode('property.*')).toThrow(AuthorizationError);
    expect(() => parsePermissionCode('Property.Read')).toThrow(AuthorizationError);
    expect(() => parsePermissionCode('admin')).toThrow(AuthorizationError);
  });
});

describe('organization authorization decisions', () => {
  it('grants an active user, active membership, and explicit effective permission', async () => {
    const decision = await authorize(new MemoryRepository());
    expect(decision.granted).toBe(true);
    if (decision.granted) {
      expect(decision.context).toMatchObject({
        userId: USER_ID,
        membershipId: MEMBERSHIP_ID,
        organizationId: ORGANIZATION_ID,
        permissions: [READ],
        authorizedAt: NOW,
      });
      expect(Object.isFrozen(decision.context)).toBe(true);
    }
  });

  it.each(['invited', 'suspended', 'revoked'] as const)(
    'denies a %s membership',
    async (status) => {
      const repository = new MemoryRepository();
      repository.membership = activeMembership(status);
      await expect(authorize(repository)).resolves.toEqual({
        granted: false,
        reason: 'membership_inactive',
      });
    },
  );

  it('denies authentication without active user or organization membership', async () => {
    const repository = new MemoryRepository();
    await expect(authorize(repository, { userId: null })).resolves.toEqual({
      granted: false,
      reason: 'unauthenticated',
    });
    repository.user = { id: USER_ID, lifecycleStatus: 'suspended' };
    await expect(authorize(repository)).resolves.toEqual({
      granted: false,
      reason: 'user_inactive',
    });
    repository.user = { id: USER_ID, lifecycleStatus: 'active' };
    repository.membership = null;
    await expect(authorize(repository)).resolves.toEqual({
      granted: false,
      reason: 'membership_not_found',
    });
  });

  it('denies disabled roles, revoked assignments, missing permissions, and matching role names', async () => {
    const repository = new MemoryRepository();
    repository.permissions = [];
    await expect(authorize(repository)).resolves.toEqual({
      granted: false,
      reason: 'permission_denied',
    });
  });

  it('denies organization mismatches without leaking protected data', async () => {
    const repository = new MemoryRepository();
    repository.membership = { ...activeMembership(), organizationId: OTHER_ORGANIZATION_ID };
    await expect(authorize(repository)).resolves.toEqual({
      granted: false,
      reason: 'organization_mismatch',
    });
    expect(new AuthorizationError('MEMBERSHIP_NOT_FOUND').message).not.toContain(ORGANIZATION_ID);
    expect(new AuthorizationError('PERMISSION_DENIED').message).not.toContain(USER_ID);
  });

  it('does not trust email, phone, provider claims, role names, or client permission arrays', async () => {
    const repository = new MemoryRepository();
    repository.membership = null;
    const untrusted = {
      userId: USER_ID,
      organizationId: ORGANIZATION_ID,
      requiredPermissions: [READ],
      email: 'same@example.invalid',
      phone: '+15550000000',
      providerSubject: 'matching-subject',
      roleName: 'Owner',
      permissions: [READ],
    };
    await expect(
      new OrganizationAuthorizationService(repository).authorize(untrusted),
    ).resolves.toEqual({
      granted: false,
      reason: 'membership_not_found',
    });
  });

  it('rejects a forged context before opening a transaction', async () => {
    const forged = { organizationId: ORGANIZATION_ID };
    const source = { connect: () => Promise.reject(new Error('must not connect')) };
    await expect(
      withAuthorizedOrganizationTransaction(source as never, forged as never, () =>
        Promise.resolve(undefined),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_AUTHORIZATION_CONTEXT' });
  });
});

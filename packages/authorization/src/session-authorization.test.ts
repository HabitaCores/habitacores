import type { RawSessionToken, SessionService } from '@habitacores/auth';
import { parseOrganizationId } from '@habitacores/domain';
import { describe, expect, it, vi } from 'vitest';

import type { OrganizationAuthorizationService } from './authorization-service.js';
import { parsePermissionCode } from './permission-code.js';
import { authorizeSessionForOrganization } from './session-authorization.js';

describe('session authorization bridge', () => {
  it('does not turn an authenticated session into organization access', async () => {
    const requiredPermission = parsePermissionCode('organization.read');
    const sessions = {
      validateSession: async () => ({
        authenticated: true,
        session: {},
        user: { id: '018f0000-0000-7000-8000-000000000001' },
      }),
    } as unknown as SessionService;
    const authorize = vi.fn(async () => ({ granted: false, reason: 'membership_not_found' }));
    const authorization = { authorize } as unknown as OrganizationAuthorizationService;
    const organizationId = parseOrganizationId('018f0000-0000-7000-8000-000000000002');

    const decision = await authorizeSessionForOrganization(sessions, authorization, {
      sessionToken: 'opaque-session' as RawSessionToken,
      organizationId,
      requiredPermissions: [requiredPermission],
    });

    expect(decision).toEqual({ granted: false, reason: 'membership_not_found' });
    expect(authorize).toHaveBeenCalledWith({
      userId: '018f0000-0000-7000-8000-000000000001',
      organizationId,
      requiredPermissions: [requiredPermission],
    });
  });

  it('denies before authorization when session validation fails', async () => {
    const sessions = {
      validateSession: async () => ({ authenticated: false, reason: 'invalid' }),
    } as unknown as SessionService;
    const authorize = vi.fn();
    const decision = await authorizeSessionForOrganization(
      sessions,
      { authorize } as unknown as OrganizationAuthorizationService,
      {
        sessionToken: 'invalid' as RawSessionToken,
        organizationId: parseOrganizationId('018f0000-0000-7000-8000-000000000002'),
        requiredPermissions: [],
      },
    );
    expect(decision).toEqual({ granted: false, reason: 'unauthenticated' });
    expect(authorize).not.toHaveBeenCalled();
  });
});

import type {
  IdentityResolutionService,
  RawBearerToken,
  RawSessionToken,
  SessionService,
  TrustedAuthenticationBoundary,
} from '@habitacores/auth';
import { parseSessionConfiguration } from '@habitacores/auth';
import { describe, expect, it } from 'vitest';

import {
  establishServerSession,
  logoutServerSession,
  readServerSession,
  type ServerCookieStore,
} from './server-auth';

function cookies(): ServerCookieStore & { values: Map<string, { value: string }> } {
  const values = new Map<string, { value: string }>();
  return {
    values,
    get: (name) => values.get(name),
    set: (cookie) => values.set(cookie.name, { value: cookie.value }),
  };
}

describe('server authentication integration', () => {
  it('issues an HttpOnly secure cookie after verified resolution', async () => {
    const written: unknown[] = [];
    const store = cookies();
    store.set = (cookie) => {
      written.push(cookie);
      store.values.set(cookie.name, { value: cookie.value });
    };
    const verifier = {
      verify: async () => ({ kind: 'verified-provider-identity' }),
    } as unknown as TrustedAuthenticationBoundary;
    const identities = {
      resolve: async () => ({ user: { lifecycleStatus: 'active' } }),
    } as unknown as IdentityResolutionService;
    const sessions = {
      createSession: async () => ({ rawToken: 'raw-session' as RawSessionToken, session: {} }),
      validateSession: async () => ({ authenticated: true, session: {}, user: {} }),
    } as unknown as SessionService;
    const config = parseSessionConfiguration({ environment: 'production' });
    expect(
      (
        await establishServerSession(
          'provider-token' as RawBearerToken,
          verifier,
          identities,
          sessions,
          store,
          config,
        )
      ).authenticated,
    ).toBe(true);
    expect(written[0]).toMatchObject({
      name: '__Host-habitacores_session',
      value: 'raw-session',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('creates no cookie when verification fails', async () => {
    const store = cookies();
    const verifier = {
      verify: async () => {
        throw new Error('invalid');
      },
    } as unknown as TrustedAuthenticationBoundary;
    await expect(
      establishServerSession(
        'invalid' as RawBearerToken,
        verifier,
        {} as IdentityResolutionService,
        {} as SessionService,
        store,
        parseSessionConfiguration({}),
      ),
    ).rejects.toThrow('invalid');
    expect(store.values.size).toBe(0);
  });

  it('reads invalid sessions as unauthenticated and logout revokes then clears', async () => {
    const config = parseSessionConfiguration({ environment: 'development' });
    const store = cookies();
    store.values.set(config.cookieName, { value: 'raw-session' });
    let revoked = false;
    const sessions = {
      validateSession: async () => ({ authenticated: false, reason: 'invalid' }),
      invalidateSession: async () => {
        revoked = true;
      },
    } as unknown as SessionService;
    expect(await readServerSession(sessions, store, config)).toEqual({
      authenticated: false,
      reason: 'invalid',
    });
    await logoutServerSession(sessions, store, config);
    expect(revoked).toBe(true);
    expect(store.values.get(config.cookieName)?.value).toBe('');
  });
});

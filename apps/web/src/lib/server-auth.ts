import {
  createClearedSessionCookie,
  createSessionCookie,
  type IdentityResolutionService,
  type RawBearerToken,
  type RawSessionToken,
  type SessionConfiguration,
  type SessionCookie,
  type SessionService,
  type SessionValidationResult,
  type TrustedAuthenticationBoundary,
} from '@habitacores/auth';

export interface ServerCookieStore {
  get(name: string): { readonly value: string } | undefined;
  set(cookie: SessionCookie): void;
}

export async function establishServerSession(
  rawProviderToken: RawBearerToken,
  verifier: TrustedAuthenticationBoundary,
  identities: IdentityResolutionService,
  sessions: SessionService,
  cookies: ServerCookieStore,
  configuration: SessionConfiguration,
): Promise<SessionValidationResult> {
  const verifiedIdentity = await verifier.verify(rawProviderToken);
  const identityResolution = await identities.resolve(verifiedIdentity);
  const created = await sessions.createSession({ verifiedIdentity, identityResolution });
  cookies.set(
    createSessionCookie(created.rawToken, configuration.absoluteTimeoutSeconds, configuration),
  );
  return sessions.validateSession(created.rawToken);
}

export function readSessionToken(
  cookies: Pick<ServerCookieStore, 'get'>,
  configuration: SessionConfiguration,
): RawSessionToken | null {
  return (cookies.get(configuration.cookieName)?.value as RawSessionToken | undefined) ?? null;
}

export function readServerSession(
  sessions: SessionService,
  cookies: Pick<ServerCookieStore, 'get'>,
  configuration: SessionConfiguration,
): Promise<SessionValidationResult> {
  return sessions.validateSession(readSessionToken(cookies, configuration));
}

export async function logoutServerSession(
  sessions: SessionService,
  cookies: ServerCookieStore,
  configuration: SessionConfiguration,
): Promise<void> {
  const token = readSessionToken(cookies, configuration);
  if (token) await sessions.invalidateSession(token, 'logout');
  cookies.set(createClearedSessionCookie(configuration));
}

import type { SessionConfiguration } from './session-config.js';
import type { RawSessionToken } from './session-types.js';

export interface SessionCookie {
  readonly name: string;
  readonly value: string;
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: 'lax';
  readonly path: '/';
  readonly maxAge: number;
}

export function createSessionCookie(
  token: RawSessionToken,
  maximumAgeSeconds: number,
  config: SessionConfiguration,
): SessionCookie {
  return {
    name: config.cookieName,
    value: token,
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(0, Math.min(maximumAgeSeconds, config.absoluteTimeoutSeconds)),
  };
}

export function createClearedSessionCookie(config: SessionConfiguration): SessionCookie {
  return createSessionCookie('' as RawSessionToken, 0, config);
}

import { SessionError } from './errors.js';

const MIN_IDLE_SECONDS = 300;
const MAX_IDLE_SECONDS = 86_400;
const MIN_ABSOLUTE_SECONDS = 900;
const MAX_ABSOLUTE_SECONDS = 2_592_000;

export interface SessionConfiguration {
  readonly idleTimeoutSeconds: number;
  readonly absoluteTimeoutSeconds: number;
  readonly cookieName: string;
  readonly secureCookies: boolean;
}

export interface SessionConfigurationInput {
  readonly idleTimeoutSeconds?: number | undefined;
  readonly absoluteTimeoutSeconds?: number | undefined;
  readonly cookieName?: string | undefined;
  readonly environment?: string | undefined;
}

export function parseSessionConfiguration(input: SessionConfigurationInput): SessionConfiguration {
  const idle = input.idleTimeoutSeconds ?? 1_800;
  const absolute = input.absoluteTimeoutSeconds ?? 86_400;
  const name =
    input.cookieName ??
    (input.environment === 'development' ? 'habitacores_session' : '__Host-habitacores_session');

  if (
    !Number.isInteger(idle) ||
    !Number.isInteger(absolute) ||
    idle < MIN_IDLE_SECONDS ||
    idle > MAX_IDLE_SECONDS ||
    absolute < MIN_ABSOLUTE_SECONDS ||
    absolute > MAX_ABSOLUTE_SECONDS ||
    idle > absolute ||
    !/^(?:__Host-)?[A-Za-z0-9_-]+$/.test(name)
  ) {
    throw new SessionError('INVALID_SESSION_CONFIGURATION');
  }

  return {
    idleTimeoutSeconds: idle,
    absoluteTimeoutSeconds: absolute,
    cookieName: name,
    secureCookies: input.environment !== 'development',
  };
}

export function readSessionConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): SessionConfiguration {
  const integer = (value: string | undefined): number | undefined =>
    value === undefined ? undefined : Number(value);
  return parseSessionConfiguration({
    idleTimeoutSeconds: integer(environment.SESSION_IDLE_TIMEOUT_SECONDS),
    absoluteTimeoutSeconds: integer(environment.SESSION_ABSOLUTE_TIMEOUT_SECONDS),
    cookieName: environment.SESSION_COOKIE_NAME,
    environment: environment.NODE_ENV,
  });
}

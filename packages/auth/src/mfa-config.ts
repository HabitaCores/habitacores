import { SessionError } from './errors.js';
import type { TotpAlgorithmConfiguration } from './mfa-types.js';

export interface MfaConfiguration {
  readonly totp: TotpAlgorithmConfiguration;
  readonly challengeLifetimeSeconds: number;
  readonly maximumAttempts: number;
}

export function parseMfaConfiguration(input: Partial<MfaConfiguration> = {}): MfaConfiguration {
  const totp = input.totp ?? { stepSeconds: 30, digits: 6, allowedWindow: 1 };
  const challengeLifetimeSeconds = input.challengeLifetimeSeconds ?? 300;
  const maximumAttempts = input.maximumAttempts ?? 5;
  if (
    !Number.isInteger(totp.stepSeconds) ||
    totp.stepSeconds < 15 ||
    totp.stepSeconds > 120 ||
    (totp.digits !== 6 && totp.digits !== 8) ||
    ![0, 1, 2].includes(totp.allowedWindow) ||
    !Number.isInteger(challengeLifetimeSeconds) ||
    challengeLifetimeSeconds < 60 ||
    challengeLifetimeSeconds > 600 ||
    !Number.isInteger(maximumAttempts) ||
    maximumAttempts < 1 ||
    maximumAttempts > 10
  ) {
    throw new SessionError('INVALID_SESSION_CONFIGURATION');
  }
  return { totp, challengeLifetimeSeconds, maximumAttempts };
}

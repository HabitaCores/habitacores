import { SessionError } from './errors.js';

const trustedElevations = new WeakSet<object>();
declare const verifiedMfaElevationMarker: unique symbol;

export interface VerifiedMfaElevation {
  readonly [verifiedMfaElevationMarker]: true;
}

export function createVerifiedMfaElevation(): VerifiedMfaElevation {
  const proof = Object.freeze({}) as VerifiedMfaElevation;
  trustedElevations.add(proof);
  return proof;
}

export function assertVerifiedMfaElevation(proof: VerifiedMfaElevation): void {
  if (!trustedElevations.has(proof)) throw new SessionError('MFA_CHALLENGE_INVALID');
}

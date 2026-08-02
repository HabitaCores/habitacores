import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { RawSessionToken, SessionTokenDigest } from './session-types.js';

export interface SessionTokenCrypto {
  generateToken(): RawSessionToken;
  digestToken(token: RawSessionToken): SessionTokenDigest;
  matchesDigest(token: RawSessionToken, digest: SessionTokenDigest): boolean;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function createNodeSessionTokenCrypto(): SessionTokenCrypto {
  return {
    generateToken: () => randomBytes(32).toString('base64url') as RawSessionToken,
    digestToken: (token) => digest(token).toString('base64url') as SessionTokenDigest,
    matchesDigest: (token, expected) => {
      const actualBytes = digest(token);
      const expectedBytes = Buffer.from(expected, 'base64url');
      return (
        actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
      );
    },
  };
}

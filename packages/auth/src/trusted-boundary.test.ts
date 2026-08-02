import { describe, expect, expectTypeOf, it } from 'vitest';
import type { OrganizationId } from '@habitacores/domain';

import { AuthenticationError } from './errors.js';
import { createVerifiedProviderIdentity, parseRawBearerToken } from './trusted-boundary.js';
import type { AuthenticatedIdentity, RawBearerToken, VerifiedProviderIdentity } from './types.js';

const AUTHENTICATED_AT = new Date('2026-01-01T00:00:00.000Z');

describe('trusted authentication boundary', () => {
  it('preserves provider subjects as opaque non-UUID identifiers', () => {
    const identity = createVerifiedProviderIdentity({
      provider: 'supabase',
      subject: 'provider:opaque/subject#01',
      authenticatedAt: AUTHENTICATED_AT,
    });

    expect(identity.subject).toBe('provider:opaque/subject#01');
  });

  it('rejects unsupported providers and missing subjects', () => {
    expect(() =>
      createVerifiedProviderIdentity({
        provider: 'unsupported',
        subject: 'opaque-subject',
        authenticatedAt: AUTHENTICATED_AT,
      }),
    ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_PROVIDER' }));

    expect(() =>
      createVerifiedProviderIdentity({
        provider: 'supabase',
        subject: '   ',
        authenticatedAt: AUTHENTICATED_AT,
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_IDENTITY' }));

    expect(() =>
      createVerifiedProviderIdentity({
        provider: 'supabase',
        subject: 'opaque-subject',
        assurance: {
          level: 'aal3',
          methods: [],
        } as never,
        authenticatedAt: AUTHENTICATED_AT,
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_IDENTITY' }));
  });

  it('keeps raw tokens and verified identities as distinct types', () => {
    expectTypeOf<RawBearerToken>().not.toEqualTypeOf<VerifiedProviderIdentity>();
    expectTypeOf<VerifiedProviderIdentity>().not.toEqualTypeOf<AuthenticatedIdentity>();
    expectTypeOf<AuthenticatedIdentity>().not.toEqualTypeOf<OrganizationId>();
    expect(parseRawBearerToken('test-only-raw-token')).toBe('test-only-raw-token');
  });

  it('returns credential-safe errors', () => {
    const credential = 'credential-that-must-not-appear';

    try {
      parseRawBearerToken(undefined);
      expect.unreachable('missing bearer token should fail');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthenticationError);
      expect((error as Error).message).not.toContain(credential);
    }

    try {
      createVerifiedProviderIdentity({
        provider: credential,
        subject: credential,
        authenticatedAt: AUTHENTICATED_AT,
      });
      expect.unreachable('unsupported provider should fail');
    } catch (error) {
      expect((error as Error).message).not.toContain(credential);
    }
  });
});

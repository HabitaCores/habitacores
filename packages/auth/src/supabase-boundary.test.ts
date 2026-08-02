import { describe, expect, it } from 'vitest';

import { AuthenticationError } from './errors.js';
import { InjectedSupabaseAuthenticationBoundary } from './supabase-boundary.js';
import { parseRawBearerToken } from './trusted-boundary.js';

describe('injected Supabase verifier boundary', () => {
  it('converts injected verification output without a network connection', async () => {
    const boundary = new InjectedSupabaseAuthenticationBoundary(async () => ({
      subject: 'opaque-supabase-subject',
      authenticationMethod: 'password',
      authenticatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }));

    const identity = await boundary.verify(parseRawBearerToken('test-fixture-token'));

    expect(identity.provider).toBe('supabase');
    expect(identity.subject).toBe('opaque-supabase-subject');
  });

  it('does not expose verifier failures or raw credentials', async () => {
    const credential = 'test-token-that-must-not-leak';
    const boundary = new InjectedSupabaseAuthenticationBoundary(async () => {
      throw new Error(credential);
    });

    await expect(boundary.verify(parseRawBearerToken(credential))).rejects.toEqual(
      new AuthenticationError('UNAUTHENTICATED'),
    );
    await expect(boundary.verify(parseRawBearerToken(credential))).rejects.not.toThrow(credential);
  });
});

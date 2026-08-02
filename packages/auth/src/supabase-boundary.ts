import { AuthenticationError } from './errors.js';
import {
  createVerifiedProviderIdentity,
  type TrustedAuthenticationBoundary,
} from './trusted-boundary.js';
import type { AuthenticationAssurance, RawBearerToken, VerifiedProviderIdentity } from './types.js';

export interface VerifiedSupabaseIdentity {
  readonly subject: string;
  readonly providerEmail?: string | null;
  readonly providerPhone?: string | null;
  readonly emailVerified?: boolean | null;
  readonly phoneVerified?: boolean | null;
  readonly authenticationMethod?: string | null;
  readonly assurance?: AuthenticationAssurance | null;
  readonly authenticatedAt: Date;
}

export type SupabaseTokenVerifier = (token: RawBearerToken) => Promise<VerifiedSupabaseIdentity>;

export class InjectedSupabaseAuthenticationBoundary implements TrustedAuthenticationBoundary {
  constructor(private readonly verifySupabaseToken: SupabaseTokenVerifier) {}

  async verify(token: RawBearerToken): Promise<VerifiedProviderIdentity> {
    try {
      const verified = await this.verifySupabaseToken(token);

      return createVerifiedProviderIdentity({
        provider: 'supabase',
        ...verified,
      });
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError('UNAUTHENTICATED');
    }
  }
}

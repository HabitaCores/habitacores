import { AuthenticationError } from './errors.js';
import type {
  AuthenticationAssurance,
  AuthenticationMethod,
  ExternalIdentityProvider,
  ExternalSubject,
  RawBearerToken,
  VerifiedProviderIdentity,
} from './types.js';
import { AUTHENTICATION_METHODS, EXTERNAL_IDENTITY_PROVIDERS } from './types.js';

export interface VerifiedIdentityInput {
  readonly provider: string;
  readonly subject: string;
  readonly providerEmail?: string | null;
  readonly providerPhone?: string | null;
  readonly emailVerified?: boolean | null;
  readonly phoneVerified?: boolean | null;
  readonly authenticationMethod?: string | null;
  readonly assurance?: AuthenticationAssurance | null;
  readonly authenticatedAt: Date;
}

function parseProvider(value: string): ExternalIdentityProvider {
  if (!(EXTERNAL_IDENTITY_PROVIDERS as readonly string[]).includes(value)) {
    throw new AuthenticationError('UNSUPPORTED_PROVIDER');
  }

  return value as ExternalIdentityProvider;
}

function parseExternalSubject(value: string): ExternalSubject {
  if (!value || !value.trim()) {
    throw new AuthenticationError('INVALID_IDENTITY');
  }

  return value as ExternalSubject;
}

function parseAuthenticationMethod(value: string | null | undefined): AuthenticationMethod | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!(AUTHENTICATION_METHODS as readonly string[]).includes(value)) {
    throw new AuthenticationError('INVALID_IDENTITY');
  }

  return value as AuthenticationMethod;
}

function parseAssurance(
  value: AuthenticationAssurance | null | undefined,
): AuthenticationAssurance | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    !['aal1', 'aal2'].includes(value.level) ||
    value.methods.some((method) => !(AUTHENTICATION_METHODS as readonly string[]).includes(method))
  ) {
    throw new AuthenticationError('INVALID_IDENTITY');
  }

  return {
    level: value.level,
    methods: [...value.methods],
  };
}

export function createVerifiedProviderIdentity(
  input: VerifiedIdentityInput,
): VerifiedProviderIdentity {
  if (Number.isNaN(input.authenticatedAt.getTime())) {
    throw new AuthenticationError('INVALID_IDENTITY');
  }

  return {
    kind: 'verified-provider-identity',
    provider: parseProvider(input.provider),
    subject: parseExternalSubject(input.subject),
    providerEmail: input.providerEmail ?? null,
    providerPhone: input.providerPhone ?? null,
    emailVerified: input.emailVerified ?? null,
    phoneVerified: input.phoneVerified ?? null,
    authenticationMethod: parseAuthenticationMethod(input.authenticationMethod),
    assurance: parseAssurance(input.assurance),
    authenticatedAt: input.authenticatedAt,
  };
}

export function parseRawBearerToken(value: string | undefined): RawBearerToken {
  if (!value?.trim()) {
    throw new AuthenticationError('UNAUTHENTICATED');
  }

  return value as RawBearerToken;
}

export interface TrustedAuthenticationBoundary {
  verify(token: RawBearerToken): Promise<VerifiedProviderIdentity>;
}

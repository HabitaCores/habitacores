export type AuthenticationErrorCode =
  | 'UNAUTHENTICATED'
  | 'INVALID_IDENTITY'
  | 'UNSUPPORTED_PROVIDER'
  | 'SUSPENDED_USER'
  | 'DISABLED_USER'
  | 'UNEXPECTED_IDENTITY_RESOLUTION_FAILURE';

const AUTHENTICATION_ERROR_MESSAGES: Readonly<Record<AuthenticationErrorCode, string>> = {
  UNAUTHENTICATED: 'Authentication could not be established.',
  INVALID_IDENTITY: 'The verified identity is invalid.',
  UNSUPPORTED_PROVIDER: 'The identity provider is not supported.',
  SUSPENDED_USER: 'Authentication is unavailable for this account.',
  DISABLED_USER: 'Authentication is unavailable for this account.',
  UNEXPECTED_IDENTITY_RESOLUTION_FAILURE: 'Authentication could not be completed.',
};

export class AuthenticationError extends Error {
  constructor(readonly code: AuthenticationErrorCode) {
    super(AUTHENTICATION_ERROR_MESSAGES[code]);
    this.name = 'AuthenticationError';
  }
}

export type IdentityLinkErrorCode = 'IDENTITY_CONFLICT';

export class IdentityLinkError extends Error {
  constructor(readonly code: IdentityLinkErrorCode) {
    super('The external identity could not be linked.');
    this.name = 'IdentityLinkError';
  }
}

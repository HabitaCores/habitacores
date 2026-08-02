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

export type SessionErrorCode =
  | 'INVALID_SESSION_CONFIGURATION'
  | 'INVALID_SESSION'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'USER_INACTIVE'
  | 'SESSION_CONFLICT'
  | 'MFA_CHALLENGE_INVALID'
  | 'MFA_CHALLENGE_EXPIRED'
  | 'MFA_CHALLENGE_EXHAUSTED'
  | 'MFA_ENROLLMENT_INACTIVE'
  | 'UNEXPECTED_SESSION_FAILURE';

const SESSION_MESSAGES: Readonly<Record<SessionErrorCode, string>> = {
  INVALID_SESSION_CONFIGURATION: 'Session configuration is invalid.',
  INVALID_SESSION: 'Authentication could not be established.',
  SESSION_EXPIRED: 'Authentication could not be established.',
  SESSION_REVOKED: 'Authentication could not be established.',
  USER_INACTIVE: 'Authentication could not be established.',
  SESSION_CONFLICT: 'The session could not be updated.',
  MFA_CHALLENGE_INVALID: 'Multi-factor verification could not be completed.',
  MFA_CHALLENGE_EXPIRED: 'Multi-factor verification could not be completed.',
  MFA_CHALLENGE_EXHAUSTED: 'Multi-factor verification could not be completed.',
  MFA_ENROLLMENT_INACTIVE: 'Multi-factor verification could not be completed.',
  UNEXPECTED_SESSION_FAILURE: 'Authentication could not be completed.',
};

export class SessionError extends Error {
  constructor(readonly code: SessionErrorCode) {
    super(SESSION_MESSAGES[code]);
    this.name = 'SessionError';
  }
}

export type AuthorizationErrorCode =
  | 'UNAUTHENTICATED'
  | 'USER_INACTIVE'
  | 'MEMBERSHIP_NOT_FOUND'
  | 'MEMBERSHIP_INACTIVE'
  | 'ROLE_INACTIVE'
  | 'PERMISSION_DENIED'
  | 'ORGANIZATION_MISMATCH'
  | 'INVALID_AUTHORIZATION_CONTEXT'
  | 'AUTHORIZATION_DATA_CONFLICT'
  | 'UNEXPECTED_AUTHORIZATION_FAILURE';

const SAFE_MESSAGES: Readonly<Record<AuthorizationErrorCode, string>> = {
  UNAUTHENTICATED: 'Authorization could not be established.',
  USER_INACTIVE: 'Authorization could not be established.',
  MEMBERSHIP_NOT_FOUND: 'Organization access was denied.',
  MEMBERSHIP_INACTIVE: 'Organization access was denied.',
  ROLE_INACTIVE: 'The requested operation is not permitted.',
  PERMISSION_DENIED: 'The requested operation is not permitted.',
  ORGANIZATION_MISMATCH: 'Organization access was denied.',
  INVALID_AUTHORIZATION_CONTEXT: 'The authorization context is invalid.',
  AUTHORIZATION_DATA_CONFLICT: 'Authorization data could not be updated.',
  UNEXPECTED_AUTHORIZATION_FAILURE: 'Authorization could not be completed.',
};

export class AuthorizationError extends Error {
  constructor(readonly code: AuthorizationErrorCode) {
    super(SAFE_MESSAGES[code]);
    this.name = 'AuthorizationError';
  }
}

export type AuthorizationDenialReason =
  | 'unauthenticated'
  | 'user_inactive'
  | 'membership_not_found'
  | 'membership_inactive'
  | 'permission_denied'
  | 'organization_mismatch';

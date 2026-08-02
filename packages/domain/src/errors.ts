export type DomainErrorCode =
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'PRECONDITION_FAILED'
  | 'UNAUTHORIZED'
  | 'UNEXPECTED';

export type DomainErrorDetails = Readonly<Record<string, unknown>>;

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details: DomainErrorDetails = {},
  ) {
    super(message);
    this.name = 'DomainError';
  }

  toJSON(): Readonly<{
    code: DomainErrorCode;
    message: string;
    details: DomainErrorDetails;
  }> {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

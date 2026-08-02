export class DatabaseConfigurationError extends Error {
  readonly code = 'INVALID_DATABASE_CONFIGURATION';

  constructor(readonly variable: string) {
    super(`${variable} is missing or invalid.`);
    this.name = 'DatabaseConfigurationError';
  }
}

export class DatabaseRuntimeError extends Error {
  readonly code = 'DATABASE_RUNTIME_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'DatabaseRuntimeError';
  }
}

export class NestedTransactionNotSupportedError extends Error {
  readonly code = 'NESTED_TRANSACTION_NOT_SUPPORTED';

  constructor() {
    super('Nested transactions are not supported.');
    this.name = 'NestedTransactionNotSupportedError';
  }
}

export class InvalidOrganizationContextError extends Error {
  readonly code = 'INVALID_ORGANIZATION_CONTEXT';

  constructor() {
    super('Organization context must be a valid UUIDv7 identifier.');
    this.name = 'InvalidOrganizationContextError';
  }
}

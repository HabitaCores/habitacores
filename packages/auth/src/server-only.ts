import { AuthenticationError } from './errors.js';

export function assertAuthServerOnly(): void {
  if ('window' in globalThis || 'document' in globalThis) {
    throw new AuthenticationError('UNEXPECTED_IDENTITY_RESOLUTION_FAILURE');
  }
}

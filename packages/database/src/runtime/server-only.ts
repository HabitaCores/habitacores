import { DatabaseRuntimeError } from './errors.js';

export function assertServerOnlyRuntime(): void {
  if ('window' in globalThis || 'document' in globalThis) {
    throw new DatabaseRuntimeError('The database runtime is server-only.');
  }
}

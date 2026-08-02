export function assertAuthorizationServerOnly(): void {
  if (typeof globalThis === 'object' && 'window' in globalThis) {
    throw new Error('The Habitacores authorization package is server-only.');
  }
}

import { describe, expect, it } from 'vitest';

import { DatabaseConfigurationError } from './errors.js';
import { parseDatabaseRuntimeConfig, readDatabaseRuntimeConfig } from './config.js';

const FAKE_DATABASE_URL =
  'postgresql://fake_user:fake_password@127.0.0.1:5432/habitacores_integration_test';

describe('database runtime configuration', () => {
  it('rejects missing and empty database URLs', () => {
    expect(() => readDatabaseRuntimeConfig({})).toThrow(DatabaseConfigurationError);
    expect(() => readDatabaseRuntimeConfig({ DATABASE_URL: '  ' })).toThrow(
      DatabaseConfigurationError,
    );
  });

  it('rejects malformed URLs without exposing their contents', () => {
    const malformedSecret = 'not-a-url-with-secret-password';

    expect(() => parseDatabaseRuntimeConfig({ databaseUrl: malformedSecret })).toThrowError(
      expect.objectContaining({
        message: expect.not.stringContaining(malformedSecret),
      }),
    );
  });

  it('applies safe defaults and accepts bounded pool settings', () => {
    expect(parseDatabaseRuntimeConfig({ databaseUrl: FAKE_DATABASE_URL })).toEqual({
      databaseUrl: FAKE_DATABASE_URL,
      maxConnections: 10,
      idleTimeoutMs: 10_000,
      connectionTimeoutMs: 5_000,
    });

    expect(
      parseDatabaseRuntimeConfig({
        databaseUrl: FAKE_DATABASE_URL,
        maxConnections: 2,
        idleTimeoutMs: 2_000,
        connectionTimeoutMs: 1_000,
      }),
    ).toMatchObject({
      maxConnections: 2,
      idleTimeoutMs: 2_000,
      connectionTimeoutMs: 1_000,
    });
  });

  it('rejects unsafe pool settings without including the database URL in errors', () => {
    try {
      parseDatabaseRuntimeConfig({ databaseUrl: FAKE_DATABASE_URL, maxConnections: 500 });
      expect.unreachable('configuration validation should fail');
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseConfigurationError);
      expect((error as Error).message).not.toContain(FAKE_DATABASE_URL);
      expect((error as Error).message).not.toContain('fake_password');
    }
  });
});

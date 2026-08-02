import { describe, expect, it } from 'vitest';

import {
  IsolatedTestDatabaseConfigurationError,
  readIsolatedTestDatabaseUrl,
} from './isolated-database.js';

const SAFE_TEST_URL =
  'postgresql://habitacores_test:fake_password@127.0.0.1:5432/habitacores_integration_test';

describe('isolated test database configuration', () => {
  it('requires an explicit test URL', () => {
    expect(() => readIsolatedTestDatabaseUrl({})).toThrow(IsolatedTestDatabaseConfigurationError);
  });

  it('accepts only the designated localhost test database', () => {
    expect(readIsolatedTestDatabaseUrl({ TEST_DATABASE_URL: SAFE_TEST_URL })).toBe(SAFE_TEST_URL);
    expect(() =>
      readIsolatedTestDatabaseUrl({
        TEST_DATABASE_URL:
          'postgresql://habitacores_test:fake_password@db.example.com:5432/habitacores_integration_test',
      }),
    ).toThrow(IsolatedTestDatabaseConfigurationError);
    expect(() =>
      readIsolatedTestDatabaseUrl({
        TEST_DATABASE_URL:
          'postgresql://habitacores_test:fake_password@127.0.0.1:5432/another_database',
      }),
    ).toThrow(IsolatedTestDatabaseConfigurationError);
  });

  it('never includes supplied credentials in validation errors', () => {
    const unsafeUrl =
      'postgresql://real-looking-user:do-not-expose@production.example.com:5432/production';

    try {
      readIsolatedTestDatabaseUrl({ TEST_DATABASE_URL: unsafeUrl });
      expect.unreachable('test database validation should fail');
    } catch (error) {
      expect((error as Error).message).not.toContain('do-not-expose');
      expect((error as Error).message).not.toContain(unsafeUrl);
    }
  });
});

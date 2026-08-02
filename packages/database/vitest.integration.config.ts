import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: '../..',
  test: {
    fileParallelism: false,
    hookTimeout: 30_000,
    include: [
      'tests/integration/database-auth.integration.test.ts',
      'tests/integration/database-session.integration.test.ts',
      'tests/integration/database-runtime.integration.test.ts',
    ],
    testTimeout: 30_000,
  },
});

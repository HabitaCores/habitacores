import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: '../..',
  test: {
    fileParallelism: false,
    hookTimeout: 30_000,
    include: ['tests/integration/database-rls.integration.test.ts'],
    testTimeout: 30_000,
  },
});

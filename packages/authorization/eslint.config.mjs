import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['../../tests/integration/database-authorization.integration.test.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.integration.json'],
        projectService: false,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);

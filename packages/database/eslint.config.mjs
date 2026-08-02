import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['dist/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['packages/database/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['tests/integration/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./packages/database/tsconfig.integration.json'],
        projectService: false,
        tsconfigRootDir: new URL('../..', import.meta.url).pathname,
      },
    },
  },
);

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  out: '../../drizzle/migrations',
  schema: './src/schema/index.ts',
  strict: true,
  verbose: true,
});

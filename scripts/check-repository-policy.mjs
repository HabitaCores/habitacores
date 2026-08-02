import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];

function fail(message) {
  errors.push(message);
}

function requireFile(path) {
  if (!existsSync(resolve(root, path))) {
    fail(`Required file is missing: ${path}`);
  }
}

function walk(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (['.git', 'node_modules', '.turbo'].includes(entry.name)) {
        return [];
      }

      return walk(path);
    }

    return [path];
  });
}

const requiredFiles = [
  '.editorconfig',
  '.gitignore',
  '.node-version',
  '.nvmrc',
  '.prettierignore',
  '.prettierrc.json',
  '.github/CODEOWNERS',
  '.github/pull_request_template.md',
  'drizzle/migrations/0000_initial_tenancy.sql',
  'drizzle/migrations/meta/0000_snapshot.json',
  'drizzle/migrations/meta/_journal.json',
  'package.json',
  'packages/config/package.json',
  'packages/config/tsconfig/base.json',
  'packages/config/tsconfig/nextjs.json',
  'packages/config/tsconfig/node-library.json',
  'packages/config/tsconfig/react-library.json',
  'packages/database/drizzle.config.ts',
  'packages/database/eslint.config.mjs',
  'packages/database/package.json',
  'packages/database/src/index.ts',
  'packages/database/src/schema/index.ts',
  'packages/database/src/schema/tenancy.ts',
  'packages/database/tsconfig.build.json',
  'packages/database/tsconfig.json',
  'packages/domain/package.json',
  'packages/domain/src/index.ts',
  'packages/domain/tsconfig.build.json',
  'packages/domain/tsconfig.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'scripts/check-workspace-boundaries.mjs',
  'turbo.json',
];

for (const file of requiredFiles) {
  requireFile(file);
}

const packageJsonPath = resolve(root, 'package.json');

if (existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

  if (packageJson.packageManager !== 'pnpm@11.18.0') {
    fail('package.json must pin packageManager to pnpm@11.18.0.');
  }

  if (packageJson.engines?.node !== '>=24 <25') {
    fail('package.json must restrict Node.js to the approved 24.x line.');
  }

  if (packageJson.engines?.pnpm !== '>=11 <12') {
    fail('package.json must restrict pnpm to the approved 11.x line.');
  }
}

for (const versionFile of ['.nvmrc', '.node-version']) {
  const path = resolve(root, versionFile);

  if (existsSync(path)) {
    const value = readFileSync(path, 'utf8').trim();

    if (value !== '24.18.1') {
      fail(`${versionFile} must contain 24.18.1.`);
    }
  }
}

const prohibitedLockfiles = ['package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb'];

for (const lockfile of prohibitedLockfiles) {
  if (existsSync(resolve(root, lockfile))) {
    fail(`Prohibited secondary lockfile found: ${lockfile}`);
  }
}

const prohibitedFilePatterns = [
  /^\.env$/,
  /^\.env\.(?!example$).+/,
  /\.tfstate(?:\..+)?$/,
  /\.tfplan$/,
  /\.(?:pem|key|p12|pfx|mobileprovision)$/,
];

for (const absolutePath of walk(root)) {
  const path = relative(root, absolutePath);

  if (prohibitedFilePatterns.some((pattern) => pattern.test(path))) {
    fail(`Potential secret, state, or signing file found: ${path}`);
  }
}

if (errors.length > 0) {
  console.error('\nRepository policy validation failed:\n');

  for (const error of errors) {
    console.error(`- ${error}`);
  }

  process.exit(1);
}

console.log('Repository policy validation passed.');

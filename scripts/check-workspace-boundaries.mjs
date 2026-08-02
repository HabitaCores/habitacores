import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];

const approvedApplicationDirectories = new Set(['mobile', 'web', 'workers']);

const approvedPackageDirectories = new Set([
  'agreements',
  'ai',
  'audit',
  'auth',
  'authorization',
  'config',
  'database',
  'domain',
  'notifications',
  'outbox',
  'payments',
  'storage',
  'ui',
]);

function fail(message) {
  errors.push(message);
}

function readPackageJson(directory) {
  const path = join(directory, 'package.json');

  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, 'utf8'));
}

function listDirectories(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory)
    .map((name) => join(directory, name))
    .filter((path) => statSync(path).isDirectory());
}

for (const directory of listDirectories(resolve(root, 'apps'))) {
  const name = basename(directory);

  if (!approvedApplicationDirectories.has(name)) {
    fail(`Unapproved application directory: ${relative(root, directory)}`);
  }
}

for (const directory of listDirectories(resolve(root, 'packages'))) {
  const name = basename(directory);

  if (!approvedPackageDirectories.has(name)) {
    fail(`Unapproved package directory: ${relative(root, directory)}`);
  }

  const packageJson = readPackageJson(directory);

  if (!packageJson) {
    continue;
  }

  const expectedName = `@habitacores/${name}`;

  if (packageJson.name !== expectedName) {
    fail(`${relative(root, directory)}/package.json must use package name ${expectedName}.`);
  }

  if (packageJson.private !== true) {
    fail(`${expectedName} must remain private during the foundational phase.`);
  }

  if (packageJson.license !== 'UNLICENSED') {
    fail(`${expectedName} must use the UNLICENSED repository policy.`);
  }
}

const webPackage = readPackageJson(resolve(root, 'apps/web'));

if (webPackage) {
  if (webPackage.name !== 'web') {
    fail('apps/web/package.json must use the workspace name web.');
  }

  if (webPackage.private !== true) {
    fail('The web workspace must remain private.');
  }
}

if (errors.length > 0) {
  console.error('\nWorkspace boundary validation failed:\n');

  for (const error of errors) {
    console.error(`- ${error}`);
  }

  process.exit(1);
}

console.log('Workspace boundary validation passed.');

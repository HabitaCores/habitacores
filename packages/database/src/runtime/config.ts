import process from 'node:process';

import { DatabaseConfigurationError } from './errors.js';
import { assertServerOnlyRuntime } from './server-only.js';

const DEFAULT_MAX_CONNECTIONS = 10;
const DEFAULT_IDLE_TIMEOUT_MS = 10_000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 120_000;
const MAX_CONNECTIONS = 50;

export interface DatabaseRuntimeConfig {
  readonly databaseUrl: string;
  readonly maxConnections: number;
  readonly idleTimeoutMs: number;
  readonly connectionTimeoutMs: number;
}

export interface DatabaseRuntimeConfigInput {
  readonly databaseUrl?: string | undefined;
  readonly maxConnections?: string | number | undefined;
  readonly idleTimeoutMs?: string | number | undefined;
  readonly connectionTimeoutMs?: string | number | undefined;
}

function parseDatabaseUrl(value: string | undefined): string {
  if (!value?.trim()) {
    throw new DatabaseConfigurationError('DATABASE_URL');
  }

  try {
    const url = new URL(value);

    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      !url.pathname ||
      url.pathname === '/'
    ) {
      throw new DatabaseConfigurationError('DATABASE_URL');
    }
  } catch {
    throw new DatabaseConfigurationError('DATABASE_URL');
  }

  return value;
}

function parseInteger(
  variable: string,
  value: string | number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new DatabaseConfigurationError(variable);
  }

  return parsed;
}

export function parseDatabaseRuntimeConfig(
  input: DatabaseRuntimeConfigInput,
): DatabaseRuntimeConfig {
  assertServerOnlyRuntime();

  return Object.freeze({
    databaseUrl: parseDatabaseUrl(input.databaseUrl),
    maxConnections: parseInteger(
      'DATABASE_POOL_MAX',
      input.maxConnections,
      DEFAULT_MAX_CONNECTIONS,
      1,
      MAX_CONNECTIONS,
    ),
    idleTimeoutMs: parseInteger(
      'DATABASE_IDLE_TIMEOUT_MS',
      input.idleTimeoutMs,
      DEFAULT_IDLE_TIMEOUT_MS,
      MIN_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    ),
    connectionTimeoutMs: parseInteger(
      'DATABASE_CONNECTION_TIMEOUT_MS',
      input.connectionTimeoutMs,
      DEFAULT_CONNECTION_TIMEOUT_MS,
      MIN_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    ),
  });
}

export function readDatabaseRuntimeConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): DatabaseRuntimeConfig {
  return parseDatabaseRuntimeConfig({
    databaseUrl: environment.DATABASE_URL,
    maxConnections: environment.DATABASE_POOL_MAX,
    idleTimeoutMs: environment.DATABASE_IDLE_TIMEOUT_MS,
    connectionTimeoutMs: environment.DATABASE_CONNECTION_TIMEOUT_MS,
  });
}

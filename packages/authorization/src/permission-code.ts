import type { Brand } from '@habitacores/domain';

import { AuthorizationError } from './errors.js';

export type PermissionCode = Brand<string, 'PermissionCode'>;

const PERMISSION_CODE_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export function parsePermissionCode(value: string): PermissionCode {
  if (!PERMISSION_CODE_PATTERN.test(value) || value.includes('*')) {
    throw new AuthorizationError('PERMISSION_DENIED');
  }

  return value as PermissionCode;
}

export const INITIAL_PERMISSION_CODES = [
  'organization.read',
  'organization.manage',
  'membership.read',
  'membership.manage',
  'property.read',
  'property.manage',
] as const satisfies readonly string[];

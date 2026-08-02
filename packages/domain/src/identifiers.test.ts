import { describe, expect, it } from 'vitest';

import { InvalidUuidV7Error, isUuidV7, parseOrganizationId, parseUnitId } from './identifiers.js';

const VALID_UUID_V7 = '01890f3e-7b5a-7cc3-98c4-dc0c0c07398f';

describe('UUIDv7 identifiers', () => {
  it('accepts a valid UUIDv7 value', () => {
    expect(isUuidV7(VALID_UUID_V7)).toBe(true);
  });

  it('rejects a UUID with a different version', () => {
    expect(isUuidV7('01890f3e-7b5a-4cc3-98c4-dc0c0c07398f')).toBe(false);
  });

  it('returns a branded organization identifier', () => {
    expect(parseOrganizationId(VALID_UUID_V7)).toBe(VALID_UUID_V7);
  });

  it('normalizes valid identifiers to lowercase', () => {
    expect(parseUnitId(VALID_UUID_V7.toUpperCase())).toBe(VALID_UUID_V7);
  });

  it('throws a typed error for an invalid identifier', () => {
    expect(() => parseOrganizationId('not-a-uuid')).toThrow(InvalidUuidV7Error);
  });
});

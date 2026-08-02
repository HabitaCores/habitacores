import { InvalidUuidV7Error, isUuidV7 } from '@habitacores/domain';
import { describe, expect, it } from 'vitest';

import {
  createUuidV7IdentityIdGenerator,
  parseIdentityLinkId,
  parseUserId,
} from './identifiers.js';

const USER_ID = '01890f47-6c8a-7301-8a21-9b7c1d2e3301';
const LINK_ID = '01890f47-6c8a-7302-8a21-9b7c1d2e3302';

describe('authentication identifiers', () => {
  it('uses the domain UUIDv7 convention for user and link identifiers', () => {
    expect(parseUserId(USER_ID)).toBe(USER_ID);
    expect(parseIdentityLinkId(LINK_ID)).toBe(LINK_ID);
    expect(() => parseUserId('550e8400-e29b-41d4-a716-446655440000')).toThrow(InvalidUuidV7Error);
  });

  it('generates independent UUIDv7 identifiers', () => {
    const generator = createUuidV7IdentityIdGenerator();
    const userId = generator.createUserId();
    const linkId = generator.createIdentityLinkId();

    expect(isUuidV7(userId)).toBe(true);
    expect(isUuidV7(linkId)).toBe(true);
    expect(userId).not.toBe(linkId);
  });
});

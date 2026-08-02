import { randomBytes } from 'node:crypto';

import { type Brand, InvalidUuidV7Error, isUuidV7 } from '@habitacores/domain';

export type UserId = Brand<string, 'UserId'>;
export type IdentityLinkId = Brand<string, 'IdentityLinkId'>;

function parseIdentityId<Identifier extends string>(value: string, type: string): Identifier {
  if (!isUuidV7(value)) {
    throw new InvalidUuidV7Error(type, value);
  }

  return value.toLowerCase() as Identifier;
}

export function parseUserId(value: string): UserId {
  return parseIdentityId<UserId>(value, 'UserId');
}

export function parseIdentityLinkId(value: string): IdentityLinkId {
  return parseIdentityId<IdentityLinkId>(value, 'IdentityLinkId');
}

function generateUuidV7(): string {
  const bytes = randomBytes(16);
  let timestamp = BigInt(Date.now());

  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }

  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hexadecimal = bytes.toString('hex');

  return [
    hexadecimal.slice(0, 8),
    hexadecimal.slice(8, 12),
    hexadecimal.slice(12, 16),
    hexadecimal.slice(16, 20),
    hexadecimal.slice(20),
  ].join('-');
}

export interface IdentityIdGenerator {
  createUserId(): UserId;
  createIdentityLinkId(): IdentityLinkId;
}

export function createUuidV7IdentityIdGenerator(): IdentityIdGenerator {
  return {
    createUserId: () => parseUserId(generateUuidV7()),
    createIdentityLinkId: () => parseIdentityLinkId(generateUuidV7()),
  };
}

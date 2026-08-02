declare const brand: unique symbol;

export type Brand<Value, Name extends string> = Value & {
  readonly [brand]: Name;
};

export type OrganizationId = Brand<string, 'OrganizationId'>;
export type PropertyId = Brand<string, 'PropertyId'>;
export type CommunityId = Brand<string, 'CommunityId'>;
export type BuildingId = Brand<string, 'BuildingId'>;
export type BlockId = Brand<string, 'BlockId'>;
export type FloorId = Brand<string, 'FloorId'>;
export type UnitId = Brand<string, 'UnitId'>;

export type HabitacoresEntityId =
  OrganizationId | PropertyId | CommunityId | BuildingId | BlockId | FloorId | UnitId;

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class InvalidUuidV7Error extends Error {
  readonly code = 'INVALID_UUID_V7';

  constructor(
    readonly entityType: string,
    readonly receivedValue: string,
  ) {
    super(`${entityType} must be a valid UUIDv7 value.`);
    this.name = 'InvalidUuidV7Error';
  }
}

export function isUuidV7(value: string): boolean {
  return UUID_V7_PATTERN.test(value);
}

function parseBrandedUuidV7<Identifier extends string>(
  value: string,
  entityType: string,
): Identifier {
  if (!isUuidV7(value)) {
    throw new InvalidUuidV7Error(entityType, value);
  }

  return value.toLowerCase() as Identifier;
}

export function parseOrganizationId(value: string): OrganizationId {
  return parseBrandedUuidV7<OrganizationId>(value, 'OrganizationId');
}

export function parsePropertyId(value: string): PropertyId {
  return parseBrandedUuidV7<PropertyId>(value, 'PropertyId');
}

export function parseCommunityId(value: string): CommunityId {
  return parseBrandedUuidV7<CommunityId>(value, 'CommunityId');
}

export function parseBuildingId(value: string): BuildingId {
  return parseBrandedUuidV7<BuildingId>(value, 'BuildingId');
}

export function parseBlockId(value: string): BlockId {
  return parseBrandedUuidV7<BlockId>(value, 'BlockId');
}

export function parseFloorId(value: string): FloorId {
  return parseBrandedUuidV7<FloorId>(value, 'FloorId');
}

export function parseUnitId(value: string): UnitId {
  return parseBrandedUuidV7<UnitId>(value, 'UnitId');
}

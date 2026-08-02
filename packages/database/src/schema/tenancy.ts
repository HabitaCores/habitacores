import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
};

const nullableLabels = {
  displayName: text('display_name'),
  referenceCode: text('reference_code'),
};

function uuidV7Check(name: string, column: AnyPgColumn) {
  return check(
    name,
    sql`(get_byte(uuid_send(${column}), 6) >> 4) = 7 and (get_byte(uuid_send(${column}), 8) >> 6) = 2`,
  );
}

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey(),
    ...nullableLabels,
    ...timestamps,
  },
  (table) => [uuidV7Check('organizations_id_uuid_v7_check', table.id)],
);

export const properties = pgTable(
  'properties',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    ...nullableLabels,
    ...timestamps,
  },
  (table) => [
    uuidV7Check('properties_id_uuid_v7_check', table.id),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
      name: 'properties_organization_fk',
    }),
    unique('properties_organization_id_id_unique').on(table.organizationId, table.id),
    index('properties_organization_id_idx').on(table.organizationId),
  ],
);

export const communities = pgTable(
  'communities',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    propertyId: uuid('property_id').notNull(),
    ...nullableLabels,
    ...timestamps,
  },
  (table) => [
    uuidV7Check('communities_id_uuid_v7_check', table.id),
    foreignKey({
      columns: [table.organizationId, table.propertyId],
      foreignColumns: [properties.organizationId, properties.id],
      name: 'communities_property_tenant_fk',
    }),
    unique('communities_organization_id_id_unique').on(table.organizationId, table.id),
    index('communities_organization_property_idx').on(table.organizationId, table.propertyId),
  ],
);

export const buildings = pgTable(
  'buildings',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    communityId: uuid('community_id').notNull(),
    ...nullableLabels,
    ...timestamps,
  },
  (table) => [
    uuidV7Check('buildings_id_uuid_v7_check', table.id),
    foreignKey({
      columns: [table.organizationId, table.communityId],
      foreignColumns: [communities.organizationId, communities.id],
      name: 'buildings_community_tenant_fk',
    }),
    unique('buildings_organization_id_id_unique').on(table.organizationId, table.id),
    index('buildings_organization_community_idx').on(table.organizationId, table.communityId),
  ],
);

export const blocks = pgTable(
  'blocks',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    buildingId: uuid('building_id').notNull(),
    ...nullableLabels,
    ...timestamps,
  },
  (table) => [
    uuidV7Check('blocks_id_uuid_v7_check', table.id),
    foreignKey({
      columns: [table.organizationId, table.buildingId],
      foreignColumns: [buildings.organizationId, buildings.id],
      name: 'blocks_building_tenant_fk',
    }),
    unique('blocks_organization_id_id_unique').on(table.organizationId, table.id),
    index('blocks_organization_building_idx').on(table.organizationId, table.buildingId),
  ],
);

export const floors = pgTable(
  'floors',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    blockId: uuid('block_id').notNull(),
    ...nullableLabels,
    ...timestamps,
  },
  (table) => [
    uuidV7Check('floors_id_uuid_v7_check', table.id),
    foreignKey({
      columns: [table.organizationId, table.blockId],
      foreignColumns: [blocks.organizationId, blocks.id],
      name: 'floors_block_tenant_fk',
    }),
    unique('floors_organization_id_id_unique').on(table.organizationId, table.id),
    index('floors_organization_block_idx').on(table.organizationId, table.blockId),
  ],
);

export const units = pgTable(
  'units',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    floorId: uuid('floor_id').notNull(),
    ...nullableLabels,
    ...timestamps,
  },
  (table) => [
    uuidV7Check('units_id_uuid_v7_check', table.id),
    foreignKey({
      columns: [table.organizationId, table.floorId],
      foreignColumns: [floors.organizationId, floors.id],
      name: 'units_floor_tenant_fk',
    }),
    unique('units_organization_id_id_unique').on(table.organizationId, table.id),
    index('units_organization_floor_idx').on(table.organizationId, table.floorId),
  ],
);

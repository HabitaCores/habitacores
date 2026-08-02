import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import drizzleConfig from '../../drizzle.config.js';
import {
  blocks,
  buildings,
  communities,
  floors,
  organizations,
  properties,
  units,
} from './tenancy.js';

const hierarchyTables = [organizations, properties, communities, buildings, blocks, floors, units];
const descendantTables = [properties, communities, buildings, blocks, floors, units];
const dialect = new PgDialect();

describe('canonical tenancy schema', () => {
  it('declares every approved hierarchy table in order', () => {
    expect(hierarchyTables.map((table) => getTableConfig(table).name)).toEqual([
      'organizations',
      'properties',
      'communities',
      'buildings',
      'blocks',
      'floors',
      'units',
    ]);
  });

  it('retains explicit organization scope on every descendant', () => {
    for (const table of descendantTables) {
      const organizationId = getTableConfig(table).columns.find(
        (column) => column.name === 'organization_id',
      );

      expect(organizationId?.notNull).toBe(true);
    }
  });

  it('uses composite tenant foreign keys after the organization-to-property relationship', () => {
    for (const table of [communities, buildings, blocks, floors, units]) {
      const foreignKeys = getTableConfig(table).foreignKeys.map((foreignKey) =>
        foreignKey.reference(),
      );

      expect(
        foreignKeys.some(
          ({ columns, foreignColumns }) => columns.length === 2 && foreignColumns.length === 2,
        ),
      ).toBe(true);
    }
  });

  it('represents UUIDv7 version and RFC variant checks for every authoritative identifier', () => {
    for (const table of hierarchyTables) {
      const { checks, columns } = getTableConfig(table);
      const id = columns.find((column) => column.name === 'id');

      expect(id?.getSQLType()).toBe('uuid');
      expect(id?.hasDefault).toBe(false);
      expect(checks).toHaveLength(1);
      expect(checks[0]?.name).toMatch(/_id_uuid_v7_check$/);
      expect(dialect.sqlToQuery(checks[0]!.value).sql).toContain('get_byte');
    }
  });

  it('keeps unverified display names and reference codes nullable', () => {
    for (const table of hierarchyTables) {
      const columns = getTableConfig(table).columns;

      expect(columns.find((column) => column.name === 'display_name')?.notNull).toBe(false);
      expect(columns.find((column) => column.name === 'reference_code')?.notNull).toBe(false);
    }
  });

  it('generates schema without requiring database credentials', () => {
    expect(drizzleConfig.dialect).toBe('postgresql');
    expect('dbCredentials' in drizzleConfig).toBe(false);
  });
});

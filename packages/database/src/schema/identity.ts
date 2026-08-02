import { sql } from 'drizzle-orm';
import {
  boolean,
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

function uuidV7Check(name: string, column: AnyPgColumn) {
  return check(
    name,
    sql`(get_byte(uuid_send(${column}), 6) >> 4) = 7 and (get_byte(uuid_send(${column}), 8) >> 6) = 2`,
  );
}

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    lifecycleStatus: text('lifecycle_status').default('active').notNull(),
    displayName: text('display_name'),
    preferredEmail: text('preferred_email'),
    preferredPhone: text('preferred_phone'),
    ...timestamps,
    suspendedAt: timestamp('suspended_at', { mode: 'date', withTimezone: true }),
    disabledAt: timestamp('disabled_at', { mode: 'date', withTimezone: true }),
  },
  (table) => [
    uuidV7Check('users_id_uuid_v7_check', table.id),
    check(
      'users_lifecycle_status_check',
      sql`${table.lifecycleStatus} in ('active', 'suspended', 'disabled')`,
    ),
    check(
      'users_suspended_at_check',
      sql`${table.lifecycleStatus} <> 'suspended' or ${table.suspendedAt} is not null`,
    ),
    check(
      'users_disabled_at_check',
      sql`${table.lifecycleStatus} <> 'disabled' or ${table.disabledAt} is not null`,
    ),
  ],
);

export const externalIdentityLinks = pgTable(
  'external_identity_links',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    provider: text('provider').notNull(),
    providerSubject: text('provider_subject').notNull(),
    providerEmail: text('provider_email'),
    providerPhone: text('provider_phone'),
    emailVerified: boolean('email_verified'),
    phoneVerified: boolean('phone_verified'),
    authenticationMethod: text('authentication_method'),
    firstSeenAt: timestamp('first_seen_at', { mode: 'date', withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { mode: 'date', withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uuidV7Check('external_identity_links_id_uuid_v7_check', table.id),
    check('external_identity_links_provider_check', sql`${table.provider} in ('supabase')`),
    check(
      'external_identity_links_provider_subject_check',
      sql`octet_length(${table.providerSubject}) > 0`,
    ),
    check(
      'external_identity_links_authentication_method_check',
      sql`${table.authenticationMethod} is null or ${table.authenticationMethod} in ('password', 'magic_link', 'oauth', 'otp', 'sso')`,
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'external_identity_links_user_fk',
    }),
    unique('external_identity_links_provider_subject_unique').on(
      table.provider,
      table.providerSubject,
    ),
    index('external_identity_links_user_id_idx').on(table.userId),
  ],
);

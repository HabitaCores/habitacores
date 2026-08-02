import type { PoolClient } from 'pg';

import { IdentityLinkError } from './errors.js';
import { parseIdentityLinkId, parseUserId } from './identifiers.js';
import type {
  IdentityRepository,
  NewUserWithIdentityLink,
  ProviderProfileObservationUpdate,
  SuccessfulIdentityObservation,
} from './repository.js';
import { assertAuthServerOnly } from './server-only.js';
import type {
  ExternalIdentityLink,
  ExternalIdentityProvider,
  ExternalSubject,
  HabitacoresUser,
} from './types.js';

interface UserRow {
  created_at: Date;
  disabled_at: Date | null;
  display_name: string | null;
  id: string;
  lifecycle_status: HabitacoresUser['lifecycleStatus'];
  preferred_email: string | null;
  preferred_phone: string | null;
  suspended_at: Date | null;
  updated_at: Date;
}

interface IdentityLinkRow {
  authentication_method: ExternalIdentityLink['authenticationMethod'];
  created_at: Date;
  email_verified: boolean | null;
  first_seen_at: Date;
  id: string;
  last_seen_at: Date;
  phone_verified: boolean | null;
  provider: ExternalIdentityProvider;
  provider_email: string | null;
  provider_phone: string | null;
  provider_subject: string;
  updated_at: Date;
  user_id: string;
}

function mapUser(row: UserRow): HabitacoresUser {
  return {
    id: parseUserId(row.id),
    lifecycleStatus: row.lifecycle_status,
    displayName: row.display_name,
    preferredEmail: row.preferred_email,
    preferredPhone: row.preferred_phone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    suspendedAt: row.suspended_at,
    disabledAt: row.disabled_at,
  };
}

function mapIdentityLink(row: IdentityLinkRow): ExternalIdentityLink {
  return {
    id: parseIdentityLinkId(row.id),
    userId: parseUserId(row.user_id),
    provider: row.provider,
    providerSubject: row.provider_subject as ExternalSubject,
    providerEmail: row.provider_email,
    providerPhone: row.provider_phone,
    emailVerified: row.email_verified,
    phoneVerified: row.phone_verified,
    authenticationMethod: row.authentication_method,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export interface IdentityDatabasePool {
  connect(): Promise<PoolClient>;
}

async function withIdentityTransaction<Result>(
  pool: IdentityDatabasePool,
  callback: (client: PoolClient) => Promise<Result>,
): Promise<Result> {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }

    throw error;
  } finally {
    client.release();
  }
}

export class PostgresIdentityRepository implements IdentityRepository {
  constructor(private readonly pool: IdentityDatabasePool) {
    assertAuthServerOnly();
  }

  async findUserById(userId: HabitacoresUser['id']): Promise<HabitacoresUser | null> {
    const client = await this.pool.connect();

    try {
      const result = await client.query<UserRow>(
        `select id, lifecycle_status, display_name, preferred_email, preferred_phone,
                created_at, updated_at, suspended_at, disabled_at
         from users
         where id = $1`,
        [userId],
      );

      return result.rows[0] ? mapUser(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async findIdentityLink(
    provider: ExternalIdentityProvider,
    subject: ExternalSubject,
  ): Promise<ExternalIdentityLink | null> {
    const client = await this.pool.connect();

    try {
      const result = await client.query<IdentityLinkRow>(
        `select id, user_id, provider, provider_subject, provider_email, provider_phone,
                email_verified, phone_verified, authentication_method, first_seen_at,
                last_seen_at, created_at, updated_at
         from external_identity_links
         where provider = $1 and provider_subject = $2`,
        [provider, subject],
      );

      return result.rows[0] ? mapIdentityLink(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async createUserWithIdentityLink(
    input: NewUserWithIdentityLink,
  ): Promise<NewUserWithIdentityLink> {
    try {
      return await withIdentityTransaction(this.pool, async (client) => {
        const userResult = await client.query<UserRow>(
          `insert into users (
             id, lifecycle_status, display_name, preferred_email, preferred_phone,
             created_at, updated_at, suspended_at, disabled_at
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           returning id, lifecycle_status, display_name, preferred_email, preferred_phone,
                     created_at, updated_at, suspended_at, disabled_at`,
          [
            input.user.id,
            input.user.lifecycleStatus,
            input.user.displayName,
            input.user.preferredEmail,
            input.user.preferredPhone,
            input.user.createdAt,
            input.user.updatedAt,
            input.user.suspendedAt,
            input.user.disabledAt,
          ],
        );
        const linkResult = await client.query<IdentityLinkRow>(
          `insert into external_identity_links (
             id, user_id, provider, provider_subject, provider_email, provider_phone,
             email_verified, phone_verified, authentication_method, first_seen_at,
             last_seen_at, created_at, updated_at
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           returning id, user_id, provider, provider_subject, provider_email, provider_phone,
                     email_verified, phone_verified, authentication_method, first_seen_at,
                     last_seen_at, created_at, updated_at`,
          [
            input.identityLink.id,
            input.identityLink.userId,
            input.identityLink.provider,
            input.identityLink.providerSubject,
            input.identityLink.providerEmail,
            input.identityLink.providerPhone,
            input.identityLink.emailVerified,
            input.identityLink.phoneVerified,
            input.identityLink.authenticationMethod,
            input.identityLink.firstSeenAt,
            input.identityLink.lastSeenAt,
            input.identityLink.createdAt,
            input.identityLink.updatedAt,
          ],
        );

        const user = userResult.rows[0];
        const identityLink = linkResult.rows[0];

        if (!user || !identityLink) {
          throw new Error('Identity creation returned no rows.');
        }

        return {
          user: mapUser(user),
          identityLink: mapIdentityLink(identityLink),
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new IdentityLinkError('IDENTITY_CONFLICT');
      }

      throw error;
    }
  }

  async recordSuccessfulIdentityObservation(input: SuccessfulIdentityObservation): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(
        `update external_identity_links
         set authentication_method = $2, last_seen_at = $3, updated_at = $3
         where id = $1`,
        [input.identityLinkId, input.authenticationMethod, input.observedAt],
      );
    } finally {
      client.release();
    }
  }

  async updateProviderProfileObservations(input: ProviderProfileObservationUpdate): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(
        `update external_identity_links
         set provider_email = $2,
             provider_phone = $3,
             email_verified = $4,
             phone_verified = $5,
             updated_at = $6
         where id = $1`,
        [
          input.identityLinkId,
          input.providerEmail,
          input.providerPhone,
          input.emailVerified,
          input.phoneVerified,
          input.observedAt,
        ],
      );
    } finally {
      client.release();
    }
  }

  async suspendUser(
    userId: HabitacoresUser['id'],
    suspendedAt: Date,
  ): Promise<HabitacoresUser | null> {
    return this.updateLifecycle(userId, 'suspended', suspendedAt);
  }

  async disableUser(
    userId: HabitacoresUser['id'],
    disabledAt: Date,
  ): Promise<HabitacoresUser | null> {
    return this.updateLifecycle(userId, 'disabled', disabledAt);
  }

  private async updateLifecycle(
    userId: HabitacoresUser['id'],
    lifecycleStatus: 'suspended' | 'disabled',
    changedAt: Date,
  ): Promise<HabitacoresUser | null> {
    const client = await this.pool.connect();

    try {
      const timestampColumn = lifecycleStatus === 'suspended' ? 'suspended_at' : 'disabled_at';
      const result = await client.query<UserRow>(
        `update users
         set lifecycle_status = $2, ${timestampColumn} = $3, updated_at = $3
         where id = $1
         returning id, lifecycle_status, display_name, preferred_email, preferred_phone,
                   created_at, updated_at, suspended_at, disabled_at`,
        [userId, lifecycleStatus, changedAt],
      );

      return result.rows[0] ? mapUser(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }
}

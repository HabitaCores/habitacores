# Authentication Identity Boundary

## Status and Ownership

The provider-neutral authentication boundary, Habitacores user model, identity resolver, and global
identity tables are **implemented**. Supabase Auth is the **approved** external identity provider,
but it is not connected or configured by this repository. Sessions, cookies, MFA, and OAuth routes
remain **deferred**. Organization authorization is
**implemented separately** as documented in `organization-authorization.md`.

Supabase will verify external credentials and return a trusted provider subject. Habitacores owns
the independent `UserId`, user lifecycle, profile authority, identity links, and future authorization
data. Provider subjects are opaque strings; they are never treated as UUIDs or exposed as internal
user identifiers.

## Trusted Resolution Flow

1. Raw bearer-token data is represented only as `RawBearerToken`.
2. A trusted, injected verifier returns a `VerifiedProviderIdentity` containing provider, opaque
   subject, observations, authentication method, and assurance where available.
3. `IdentityResolutionService` looks up only `(provider, provider_subject)`.
4. An existing link resolves its Habitacores user. A missing link creates a new UUIDv7 user and link
   in one transaction.
5. The database unique constraint makes concurrent creation converge on one link. The losing request
   re-reads the winning link without exposing conflict details.
6. Suspended and disabled users fail closed. Active users receive an `AuthenticatedIdentity` for
   future session handling.

Email and phone values are non-authoritative provider observations. Matching values never merge or
link accounts and are not unique identity keys. Observation refreshes never overwrite Habitacores
preferred profile fields.

## Authentication Is Not Authorization

`AuthenticatedIdentity` contains no organization assignment or PostgreSQL tenant context.
Authentication success does not establish access to any organization. Membership and permission
evaluation is implemented separately and must succeed before trusted application code may set an
organization context.

## Database Security Boundary

`users` and `external_identity_links` are global application identity records, not organization-owned
rows. Organization RLS is intentionally not copied onto them. They have no PUBLIC table grants and
the non-owner test runtime role receives only `SELECT`, `INSERT`, `UPDATE`, and `DELETE`. Access is
restricted architecturally to the server-only repository package; no browser export or privileged
Supabase client exists.

The schema stores no passwords, password hashes, access tokens, refresh tokens, MFA secrets, anon
keys, or service-role credentials.

## Local and CI Verification

Use only the disposable database described in `database-integration-testing.md`:

```sh
pnpm test:unit
pnpm test:integration
pnpm test:rls
```

Unit tests require no network. Integration tests apply migrations only to the validated localhost
test database. CI runs both suites against its disposable PostgreSQL 18 service with fake
credentials and does not silently skip.

## Known Limitations

This package does not issue sessions, verify production tokens, connect to Supabase, enroll MFA,
authorize organizations by itself, or provide account recovery. Provider configuration, key rotation,
production runtime-role provisioning, operational monitoring, audit events, and privacy workflows
remain **deferred**. The implemented identity model is not a claim of complete authentication.

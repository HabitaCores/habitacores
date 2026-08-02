# Database Integration Testing

## Status and Scope

The database runtime and isolated-test harness are **implemented**. PostgreSQL RLS policies,
authorization decisions, production connectivity, and production migration execution remain
**deferred**. No production connection is configured by this repository.

## Local Prerequisites

Docker/Testcontainers is not available in the current development environment, so integration tests
use an explicit `TEST_DATABASE_URL`. Provision a disposable local PostgreSQL 18 database named
`habitacores_integration_test`; the harness rejects remote hosts and other database names. The test
command destroys and recreates its `public` schema before migration and again during cleanup. Never
point it at a database containing data that must be retained.

Copy only the fake values from `packages/database/.env.example` into your local environment. Do not
commit a populated `.env` file.

```sh
export TEST_DATABASE_URL='postgresql://habitacores_test:habitacores_test@127.0.0.1:5432/habitacores_integration_test'
pnpm db:migrate:test
pnpm test:integration
```

The command fails clearly when `TEST_DATABASE_URL` is absent or unsafe; tests are never silently
skipped. CI uses a disposable `postgres:18-alpine` service, fake CI-only credentials, and a health
check. The service is destroyed with the CI job.

## Runtime Variables

Server runtime configuration accepts `DATABASE_URL`, `DATABASE_POOL_MAX`,
`DATABASE_IDLE_TIMEOUT_MS`, and `DATABASE_CONNECTION_TIMEOUT_MS`. Configuration is read only when
the server calls the runtime factory. Importing `@habitacores/database/runtime` creates no pool or
connection, and browser use is unsupported.

`TEST_DATABASE_URL` is accepted only by isolated migration and integration-test tooling. It must use
`localhost`, `127.0.0.1`, or `::1` and the exact database name `habitacores_integration_test`.

## Future RLS Foundation

Within an explicit transaction, `setTransactionOrganizationContext` validates a UUIDv7 organization
identifier and calls parameterized PostgreSQL `set_config(..., true)`. The `true` flag confines the
setting to the current transaction, preventing tenant context from persisting when a pooled
connection is reused. This is scaffolding only: tenant isolation is not complete, and no RLS policy
is implemented.

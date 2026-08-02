# PostgreSQL Row-Level Security

## Status and Scope

Database-level organization isolation for the current tenancy hierarchy is **implemented** by
`0001_organization_rls.sql`. It protects `organizations`, `properties`, `communities`, `buildings`,
`blocks`, `floors`, and `units`. Authentication, memberships, application permissions, audit events,
and production role provisioning remain **deferred**.

## Tenant-Context Contract

Trusted server code must open a transaction and call `setTransactionOrganizationContext` with a
validated UUIDv7 organization identifier before querying protected data. PostgreSQL stores
`habitacores.organization_id` transaction-locally. The invoker-rights function
`habitacores.current_organization_id()` returns that value as `uuid`, returns `null` when absent, and
errors on malformed values. Missing context therefore exposes no rows and permits no protected
write. Commit, rollback, and pooled connection reuse clear the effective context.

Organization context is **not authorization**. A future application authorization layer must decide
whether an authenticated actor may establish a particular context.

## Policy Matrix

| Operation | `organizations` predicate        | Descendant predicate                          |
| --------- | -------------------------------- | --------------------------------------------- |
| SELECT    | `id = current organization`      | `organization_id = current organization`      |
| INSERT    | `WITH CHECK` on `id`             | `WITH CHECK` on `organization_id`             |
| UPDATE    | `USING` and `WITH CHECK` on `id` | `USING` and `WITH CHECK` on `organization_id` |
| DELETE    | `USING` on `id`                  | `USING` on `organization_id`                  |

All seven tables enable and force RLS. Each operation has a separate named policy.

## Migration and Runtime Authority

Migrations run under an administrative test role that owns database objects. Application queries in
RLS tests run under `habitacores_runtime_test`, a fake, isolated role with `NOSUPERUSER`,
`NOBYPASSRLS`, `NOINHERIT`, and no object ownership. It receives only schema usage, helper execution,
and `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on protected tables. The migration does not create a
runtime role or embed credentials.

## Local Verification

Point only to the disposable local database documented in `database-integration-testing.md`, then run:

```sh
pnpm db:rls:check
pnpm test:integration
pnpm test:rls
```

The RLS suite applies migrations only inside that isolated database and verifies policies through
real PostgreSQL queries and system catalogs. Tests never silently skip.

## Known Limitations

This package proves organization isolation for the current seven-table hierarchy only. It does not
prove end-to-end tenant security, authenticate actors, authorize context selection, provision
production roles, redact every future error path, or cover future tenant-owned tables. Production
migration execution and operational rollout are **unverified** and require human-controlled release
governance.

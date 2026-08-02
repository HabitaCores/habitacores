# Organization Authorization

## Status and Boundary

Organization memberships, roles, permissions, authorization decisions, and trusted tenant-context
establishment are **implemented** in `@habitacores/authorization`. Authentication proves a global
Habitacores user identity; it never grants organization access. A user becomes eligible only through
an active `organization_memberships` row. Email, phone, provider claims, role names, feature flags,
and client-provided permission arrays are never authorization inputs.

## Memberships, Roles, and Permissions

Membership lifecycle is `invited → active → suspended or revoked`; records are retained rather than
hard-deleted. Roles are organization-owned and may be active or disabled. Active role assignments
connect a same-organization membership and role through composite foreign keys. Effective
permissions are the distinct, non-revoked permission codes reached through active assignments,
active roles, and active role-permission grants. Display names carry no authority and wildcard
permissions are invalid.

The migration seeds `organization.read`, `organization.manage`, `membership.read`,
`membership.manage`, `property.read`, and `property.manage`. This vocabulary is **provisional
implementation seed data**, not an approved or complete product permission matrix.

## Decision and Database Flow

`OrganizationAuthorizationService` accepts a Habitacores `UserId`, an explicit `OrganizationId`, and
required permission codes. It fails closed with a non-leaking denial unless the user, membership,
assignments, roles, and grants are active. Success creates an opaque, immutable
`AuthorizedOrganizationContext` containing user, membership, organization, effective permissions,
decision time, and source metadata. Raw organization IDs cannot enter
`withAuthorizedOrganizationTransaction`; that helper verifies the trusted context, opens a
transaction, sets `habitacores.organization_id` locally, and commits or rolls back without leaking
context to pooled connections.

Application authorization is the permission engine. PostgreSQL RLS remains defense in depth:
memberships, roles, and membership-role assignments use direct organization policies;
role-permission scope is derived through its role. Global permissions do not use organization RLS
and the test runtime role receives read-only access. Migration authority remains separate from the
non-owner, `NOSUPERUSER`, `NOBYPASSRLS` runtime role.

## Verification and Limitations

Run `pnpm authorization:policy:check`, `pnpm test:unit`, `pnpm test:integration`,
`pnpm test:rls`, and `pnpm test:authorization` with only the approved disposable PostgreSQL database.
CI provisions that database automatically.

Production authorization-query authority, invitation delivery, management UI, audit persistence,
outbox behavior, authorization caching, and a complete approved permission matrix remain
**deferred**. No production database connectivity or runtime-role provisioning is implemented.

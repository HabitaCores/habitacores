# Repository Guidelines

## Scope and Architecture

Habitacores is a private TypeScript monorepo for a multi-tenant real-estate operating ecosystem.
Applications live in `apps/`, reusable modules in `packages/`, database assets in `drizzle/`,
infrastructure in `infra/`, cross-cutting tests in `tests/`, and governance utilities in `scripts/`.
Do not implement product functionality unless the bounded work package explicitly authorizes it.

Use the approved stack: Node.js 24, pnpm 11, Turborepo, strict TypeScript, ESLint, Prettier,
Vitest, PostgreSQL, and Drizzle ORM. Do not substitute tools without an approved architectural
decision. Use two-space indentation, single quotes, semicolons, trailing commas, and the configured
100-character Prettier width. Colocate unit tests as `*.test.ts`.

## Git and Delivery Safety

- Never work directly on `main`. Create one `codex/<bounded-package>` branch per bounded
  implementation package; do not combine unrelated work.
- Never merge pull requests, force-push, bypass CI, disable checks, or approve your own changes.
- Never connect to production or run commands against production services.
- Never read, introduce, log, copy, request, or expose production credentials or production data.
- Never apply database migrations. Migration design and files require explicit authorization;
  execution remains a human-controlled operation.
- Keep commits focused and use Conventional Commits, for example `feat(domain): add unit identity`.

## Domain and Data Integrity

Preserve the canonical hierarchy exactly:
`Organization → Property → Community → Building → Block → Floor → Unit`.
Authoritative identifiers use UUIDv7. Every tenant-owned record must retain explicit organization
scope through storage, queries, events, jobs, APIs, and tests; never rely only on inferred ancestry.
Never invent property names, addresses, unit or floor counts, legal terms, financial values, or
other business facts. If authoritative input is absent, stop and record it as unverified.

Clearly label statements and artifacts as **approved**, **proposed**, **implemented**, **deferred**,
or **unverified**. Do not present proposed architecture as approved or code presence as proof that a
feature is operational.

## Validation and Completion

Before completing work, run every repository quality gate from the root:

```sh
pnpm repository:policy
pnpm workspace:boundaries
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
```

Use `pnpm install --frozen-lockfile` when dependency installation is needed. Do not claim success
for skipped or failing checks; report each result and the reason for any limitation.

Every handoff must report the branch name, commit SHA (or `not committed`), files changed,
validation results, known limitations, and pull-request URL (or `not opened`). PRs must follow
`.github/pull_request_template.md`, include governing issues or decisions, assess impacts, provide
test evidence, and include screenshots for visible UI changes. Human review is mandatory.

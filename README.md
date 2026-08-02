# Habitacores

Habitacores is a multi-tenant real-estate operating ecosystem designed
initially for the Nigerian rental market.

## Repository Status

This repository is under controlled foundational implementation.

Architecture decisions are maintained separately in the private
`habitacores-product-knowledge-base` repository.

## Approved Architecture Direction

- TypeScript monorepo
- Node.js 24 LTS
- pnpm 11
- Turborepo
- Next.js web application
- React Native with Expo mobile application
- PostgreSQL with Drizzle ORM
- Supabase initial managed platform services
- OpenTofu infrastructure as code
- GitHub Actions CI/CD
- Responsible AI through a centralized AI Gateway

## Workspace Structure

```text
apps/
  web/
  mobile/
  workers/

packages/
  config/
  database/
  domain/
  auth/
  authorization/
  audit/
  outbox/
  storage/
  notifications/
  payments/
  agreements/
  ai/
  ui/

drizzle/
infra/
docs/
scripts/
tests/

```

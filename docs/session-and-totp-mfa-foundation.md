# Session and TOTP MFA Foundation

Status: **implemented foundation**. Production authentication, key management, and Supabase connectivity are **deferred** and **unverified**.

## Trust boundaries

A raw provider bearer token is accepted only by the injected, server-only verification boundary. Verified provider identity is resolved to an active Habitacores user before a session can be created. The raw opaque session token is returned once and placed only in an HttpOnly cookie; PostgreSQL stores its SHA-256 lookup digest. Neither provider nor session tokens belong in Client Components, URLs, logs, analytics, `localStorage`, or `sessionStorage`.

Authentication is not organization authorization. A valid session establishes a global user only. `authorizeSessionForOrganization` still evaluates Step 009 membership and permissions before producing the unforgeable `AuthorizedOrganizationContext`; only that context may establish tenant database scope.

## Session lifecycle

Sessions are `active`, `revoked`, or `expired`. Defaults are a 30-minute idle timeout and 24-hour absolute timeout, with validated hard bounds. Activity may extend idle expiry only up to the absolute deadline. Rotation creates a fresh token/digest and atomically supersedes the old session. Logout, user suspension/disablement, expiration, invalidation, and MFA lifecycle changes revoke applicable sessions.

Deployed cookies use `__Host-habitacores_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain`, and bounded `Max-Age`. Local development uses a non-`__Host-` name without `Secure`.

## TOTP MFA

Enrollment is `pending`, `active`, or `disabled`. TOTP secrets cross an injected encryption/key-version boundary; plaintext secrets are never persisted. Recovery codes are returned once and stored only as hashes, then atomically consumed once. Challenges expire, allow 1–10 attempts, fail closed, and elevate assurance from `single_factor` to `multi_factor` only after server verification and session rotation. Client assurance is ignored. TOTP replay prevention beyond single challenge completion is **deferred**; TOTP is not phishing resistant.

The TOTP algorithm, secret protection, and recovery hashing are provider-neutral injected interfaces. Selection of vetted production implementations, production key custody/rotation, rate limiting, device management UI, recovery administration, production Supabase configuration, and operational monitoring remain **deferred**.

## Database and validation

Security tables are global user records, not organization-owned data. They intentionally do not copy tenant RLS policies; trusted server repositories receive minimum DML privileges, with no browser or `PUBLIC` grants. The runtime role remains non-owner, non-superuser, and `NOBYPASSRLS`.

Use disposable PostgreSQL only:

```sh
pnpm test:session
pnpm test:mfa
TEST_DATABASE_URL=postgresql://...@127.0.0.1:5432/habitacores_integration_test pnpm test:integration
pnpm session:security:check
```

If `TEST_DATABASE_URL` is absent, database tests fail closed. Never substitute production or Supabase.

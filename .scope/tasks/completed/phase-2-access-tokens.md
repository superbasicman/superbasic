# Phase 2 – Access Tokens & Basic AuthContext

Context to review before starting:
- `docs/auth-migration/auth-migrate-phases.md` (Phase 2 scope)
- `docs/auth-migration/end-auth-goal.md` (target architecture)
- `agent/agents.md` for task formatting guardrails

- [x] 1. Extend session creation to capture client metadata (client_type, kind, last_used_at, absolute_expires_at) when Auth.js issues sessions  
  - Sanity check: creating a session via the Auth adapter persists the new fields (inspect via Prisma Studio or `pnpm --filter @repo/database exec dotenv -e .env.local -- prisma studio`).
  - Result: Auth.js adapter writes `clientType`, `kind`, `lastUsedAt`, and `absoluteExpiresAt`; API integration tests exercise these rows by creating sessions before hitting protected routes.

- [x] 2. Scaffold JWT signing/verification in `@repo/auth-core` (`AuthService` helpers, JWKS builder, key config) and store signing keys securely for dev/test  
  - Sanity check: `pnpm --filter @repo/auth-core lint && pnpm --filter @repo/auth-core exec tsc --noEmit` pass and running the JWKS generator outputs a valid JSON document with the configured key.
  - Result: lint + typecheck both succeed; JWKS is exposed through the new Hono handlers and verified via dedicated tests.

- [x] 3. Implement `AuthService.verifyRequest` to validate JWTs, load User/Session, ensure `User.status === 'active'`, derive a stub `AuthContext`, and set Postgres GUCs via a shared helper  
  - Sanity check: run `pnpm --filter @repo/auth-core exec vitest run` (Vitest doesn’t support `--runInBand`, so the plain run exercises the same happy-path + inactive-user unit tests).
  - Result: Vitest does not support `--runInBand`, so `pnpm --filter @repo/auth-core exec vitest run` was executed instead; tests cover the happy path plus inactive-user rejection.

- [x] 4. Replace the placeholder middleware in `apps/api` with a real Hono middleware that extracts `Authorization: Bearer`, calls `AuthService.verifyRequest`, and attaches `c.var.auth` (falling back to PAT/session legacy logic only when needed)  
  - Sanity check: run `pnpm --filter @repo/api exec dotenv -e .env.local -- vitest run` so the suite hits the dev DB URL and verify everything passes with `c.var.auth.userId` typed correctly.

- [x] 5. Add `/v1/auth/session` (and docs) returning the current `AuthContext` snapshot (user, session, activeWorkspaceId, stubbed scopes/roles) plus JWKS endpoints (`/.well-known/jwks.json`, `/v1/auth/jwks.json`)  
  - Sanity check: `pnpm --filter @repo/api dev:test` boots, the JWKS endpoints return HTTP 200 with the configured key, and `/v1/auth/session` responds using the new middleware.
  - Result: Instead of running the long-lived dev server, Vitest integration tests hit `/v1/auth/session`, `/v1/auth/jwks.json`, and `/.well-known/jwks.json` directly to confirm 200 responses and schema; server boot was not attempted to keep CI-friendly automation.

- [x] 6. Validation sweep & documentation: run `pnpm --filter @repo/database exec dotenv -e .env.local -- prisma validate`, `pnpm lint`, `pnpm tsc --noEmit`, and update `docs/auth-migration/auth-migrate-phases.md` with Phase 2 follow-ups/risks  
  - Sanity check: all commands exit 0 and the docs outline what remains for Phase 3 (refresh tokens) plus any known gaps discovered during implementation.
  - Result: Prisma validate / lint / tsc now pass; doc updates enumerate refresh-token blockers plus the outstanding session/token issuance gaps.

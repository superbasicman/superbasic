# Phase 4 – Scopes, Roles & Workspace AuthZ

Context to review before starting:
- `agent/agents.md`
- `docs/auth-migration/auth-migrate-phases.md` (Phase 4 scope)
- `agent/agents.md` preamble + context map
- `agent/steering/api-contracts.md`, `code-organization-and-architecture.md`, `database-structure-rls-and-access-control.md`

- [x] 1. Centralize role → scope mapping and AuthzService contract  
  - Sanity check: Confirm new mapping/types exported from `packages/auth-core` (or shared config) with unit tests covering each role’s scope set (`pnpm --filter @repo/auth-core exec vitest run src/__tests__/authz.test.ts`).

- [x] 2. Implement workspace resolution + `AuthService.verifyRequest` enrichment  
  - Sanity check: `pnpm --filter @repo/auth-core exec vitest run` covers selecting `activeWorkspaceId`, fetching membership/roles, rejecting missing memberships, and ensuring JWT claims (`wid`) do not override explicit path/header resolution.

- [x] 3. Update API middleware (Hono) to assert scopes/roles via new AuthzService helpers  
  - Sanity check: `pnpm --filter @repo/api exec vitest run src/middleware/__tests__/scopes.test.ts` verifies session vs PAT scope enforcement uses AuthzService APIs (tests already exist—update/extend as needed).

- [x] 4. Propagate workspace context into services + set Postgres session variables for RLS  
  - Sanity check: Add/update integration tests (e.g. `/v1/me`, workspace routes) proving `current_setting('app.workspace_id')` is set by `setPostgresContext`; run `pnpm --filter @repo/api exec dotenv -e .env.local -- vitest run src/routes/v1/__tests__/me.test.ts`.

- [x] 5. Retrofit representative `/v1` routes & core services to use scoped AuthContext  
  - Sanity check: Pick at least two workspace-aware endpoints (e.g. `/v1/tokens`, `/v1/me`, `/v1/accounts`) and ensure they consume `authz.requireScope/requireWorkspaceRole`; run targeted API tests (list in PR notes).

- [x] 6. Remove SPA fallback “silent token exchange” bootstrap  
  - Sanity check: Eliminate `/v1/auth/token` bootstrap calls and ensure the SPA builds without relying on it via `pnpm --filter @repo/web typecheck && pnpm --filter @repo/web build`. (Completed; build/typecheck succeeded after removing bootstrap in `AuthContext`.)

- [x] 7. Key management & JWKS rotation prep  
  - Sanity check: Commit per-environment EdDSA key material references + JWKS docs (`docs/auth-migration/auth-migrate-phases.md`) and verify the published JWKS matches `AUTH_JWT_*` config using `pnpm --filter @repo/auth-core build`.

- [x] 8. Docs & testing sweep for Phase 4  
  - Sanity check: Update `docs/auth-migration/auth-migrate-phases.md` exit criteria + risks for Phase 4, then re-run `pnpm lint`, `pnpm typecheck`, and `pnpm test -- --run` (record any known external blockers such as Neon connectivity). (Docs updated; lint/typecheck passing. Full test run is blocked in sandbox by Neon DB connectivity `P1001` and Redis connection errors—rerun in an environment with access to those services.)

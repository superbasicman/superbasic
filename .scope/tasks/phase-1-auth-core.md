# Phase 1 – Auth-Core Foundation

Context to review before starting:
- `docs/auth-migration/auth-migrate-phases.md` (Phase 1 scope)
- `docs/auth-migration/end-auth-goal.md` (target architecture)
- `agent/agents.md` for task formatting guardrails

- [x] 1. Capture schema deltas for auth core (users.status, enriched sessions, unified tokens, user_identities, oauth_clients stub) and outline migration/backfill steps  
  - Sanity check: Prisma schema diff reflects the new structures without breaking existing tables.

- [x] 2. Bootstrap `packages/auth-core` with types (`AuthContext`, `ClientType`, `VerifiedIdentity`, `PermissionScope`), interface stubs (`IdentityProvider`, `AuthService`, `AuthzService`), and shared error classes  
  - Sanity check: `pnpm --filter @repo/auth-core lint` (or `pnpm --filter @repo/auth-core exec tsc --noEmit`) succeeds with the new scaffolding.

- [x] 3. Export the new types/interfaces so `apps/api` (and others) can import from auth-core  
  - Sanity check: TypeScript references compile when importing from `@repo/auth-core` `pnpm --filter @repo/api exec tsc --noEmit`.

- [x] 4. Add placeholder middleware in `apps/api` that sets `c.var.auth` to the new `AuthContext` type (even if `null`) and ensure the app builds  
  - Sanity check: `pnpm --filter @repo/api build` (or equivalent) succeeds after the wiring.

- [x] 5. Run `pnpm --filter @repo/database exec dotenv -e .env.local -- prisma validate`, `pnpm lint`, and `pnpm tsc --noEmit` to confirm scaffolding compiles; document next steps for Phase 2  
  - Sanity check: all commands exit 0 and notes for Phase 2 are added to the relevant doc.
  - Result: All commands now pass (after wiring Vitest globals, enabling JSX in the base tsconfig, and cleaning up strict TypeScript errors in legacy tests/tooling).

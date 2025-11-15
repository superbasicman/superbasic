# Phase 1 – Auth-Core Foundation

- [ ] 1. Capture schema deltas for auth core (users.status, enriched sessions, unified tokens, user_identities, oauth_clients stub) and outline migration/backfill steps  
  - Sanity check: Prisma schema diff reflects the new structures without breaking existing tables.

- [ ] 2. Bootstrap `packages/auth-core` with types (`AuthContext`, `ClientType`, `VerifiedIdentity`, `PermissionScope`), interface stubs (`IdentityProvider`, `AuthService`, `AuthzService`), and shared error classes  
  - Sanity check: `pnpm lint packages/auth-core` (or `tsc`) succeeds with the new scaffolding.

- [ ] 3. Export the new types/interfaces so `apps/api` (and others) can import from auth-core  
  - Sanity check: TypeScript references compile when importing from `@repo/auth-core`.

- [ ] 4. Add placeholder middleware in `apps/api` that sets `c.var.auth` to the new `AuthContext` type (even if `null`) and ensure the app builds  
  - Sanity check: `pnpm --filter apps/api build` (or equivalent) succeeds after the wiring.

- [ ] 5. Run `pnpm prisma validate`, `pnpm lint`, and `tsc` to confirm scaffolding compiles; document next steps for Phase 2  
  - Sanity check: all commands exit 0 and notes for Phase 2 are added to the relevant doc.

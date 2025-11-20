# Phase 5 – Personal Access Tokens (PATs) Hardening

Context to review before starting:
- `docs/auth-migration/auth-migrate-phases.md` (Phase 5 scope)
- `agent/agents.md` preamble + context map
- `agent/steering/api-contracts.md`, `code-organization-and-architecture.md`, `database-structure-rls-and-access-control.md`

- [ ] 1. Implement PAT logic in `auth-core`
  - Implement `issuePersonalAccessToken`: generate `sbf_` token, hash, store in `Token` table (type='personal_access').
  - Implement `revokeToken`: find token by ID/hash, mark `revokedAt`.
  - Update `AuthService.verifyRequest`:
    - Detect `sbf_` prefix in Bearer token.
    - Hash token and lookup in `Token` table.
    - Validate expiry, revocation, and `User.status`.
    - Resolve workspace binding (if `token.workspaceId` set) or use standard resolution.
    - Build `AuthContext` with `clientType='cli'` and derived scopes.
  - Sanity check: `pnpm --filter @repo/auth-core exec vitest run src/__tests__/auth-service.test.ts`

- [ ] 2. Refactor API Middleware (`apps/api/src/middleware/pat.ts`)
  - Replace legacy `prisma.apiKey` logic with `AuthService.verifyRequest`.
  - Ensure `c.set('auth', ...)` is populated correctly.
  - Remove legacy `ApiKey` usage.
  - TODO: Debug `createAuthService()` errors in some test scenarios OR update test expectations
  - Sanity check: `pnpm --filter @repo/api exec vitest run src/middleware/__tests__/pat.test.ts`

- [ ] 3. Migrate Token Management Routes (`apps/api/src/routes/v1/tokens`)
  - Update `POST /` to use `authService.issuePersonalAccessToken`.
  - Update `DELETE /:id` to use `authService.revokeToken`.
  - Update `GET /` to list tokens from `Token` table (type='personal_access').
  - Update `PATCH /:id` (rename) to update `Token` table.
  - Sanity check: `pnpm --filter @repo/api exec vitest run src/routes/v1/tokens/__tests__/*.test.ts`

- [ ] 4. Cleanup & Verification
  - Verify CLI/automation flows using the new PATs.
  - Ensure `pnpm deploy-check --full` passes.

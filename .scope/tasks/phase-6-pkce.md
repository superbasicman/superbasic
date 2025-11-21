# Phase 6 – OAuth/PKCE for Native Apps & IdP Abstraction

Context to review before starting:
- `docs/auth-migration/auth-migrate-phases.md` (Phase 6 scope)
- `agent/agents.md` preamble + context map
- `agent/steering/api-contracts.md`, `code-organization-and-architecture.md`, `database-structure-rls-and-access-control.md`

- [x] 1. IdentityProvider abstraction & Auth core PKCE hooks  
  - Implement/extend IdentityProvider to return `VerifiedIdentity` for credentials/OAuth, and wire auth-core PKCE helpers (code generation/validation scaffolding).  
  - Sanity check: `pnpm --filter @repo/auth-core exec vitest run src/__tests__/auth-service.test.ts`

- [x] 2. OAuth client handling (seed + validation)  
  - Seed/register `OAuthClient` (e.g., `client_id = 'mobile'`, type `public`, allowed `redirectUris`); add validation helpers.  
  - Sanity check: `pnpm --filter @repo/database exec pnpm run generate` (schema updated) and `pnpm --filter @repo/auth-core exec vitest run src/__tests__/auth-service.test.ts`

- [ ] 3. `/v1/oauth/authorize` endpoint (PKCE code issuance)  
  - Validate `client_id`/`redirect_uri`/PKCE params; issue single-use auth code bound to user, client, redirect, `code_challenge`, scopes.  
  - Sanity check: `pnpm --filter @repo/api exec vitest run "src/routes/v1/oauth/__tests__/authorize.test.ts"`

- [ ] 4. `/v1/oauth/token` endpoint (code exchange → session/tokens)  
  - Validate auth code, PKCE verifier; create `Session` with `clientType='mobile'`; issue access + refresh tokens; delete code (single-use).  
  - Sanity check: `pnpm --filter @repo/api exec vitest run "src/routes/v1/oauth/__tests__/token.test.ts"`

- [ ] 5. Docs, SDK, and end-to-end validation  
  - Update docs (Phase 6 in `auth-migrate-phases.md`, API auth docs) and SDK surfaces if needed; add mobile flow notes.  
  - Sanity check: `pnpm --filter @repo/api typecheck && pnpm --filter @repo/auth-core build && pnpm deploy-check --full` (note external DB/Redis availability)

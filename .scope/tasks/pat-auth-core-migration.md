**Context:** Align PAT issuance/verification with end-state auth: use auth-core and `tokens` table (not `api_keys`), enforce workspace-aware scopes/roles, and keep API routes/audits intact during migration. 

Source docs: `docs/auth-migration/align-to-end-auth-goal.md` (item #1), `docs/auth-migration/end-auth-goal.md`, `docs/auth-migration/auth-migrate-phases.md`; guardrails/patterns per `agent/agents.md`.

- [x] 1. Implement PAT issuance and revoke in auth-core tokens
  - Sanity check: `pnpm --filter @repo/auth-core test -- --run` (or targeted unit) passes covering issue/revoke writing to `tokens` with hashed secret, expirations, and revocation audit metadata.
- [x] 2. Add PAT verification path in auth-core with workspace-aware scopes
  - Sanity check: auth-core tests prove verification rejects revoked/expired tokens, enforces workspace membership intersection on scopes/roles, and returns AuthContext consumed by API.
- [x] 3. Wire PAT middleware to auth-core verification (drop direct prisma/api_keys)
  - Sanity check: API middleware tests hit a PAT-protected route with a token issued via auth-core and succeed/fail appropriately; no queries to `api_keys` occur.
- [x] 4. Move `/v1/tokens` issuance/update/revoke to auth-core PAT APIs
  - Sanity check: route tests show tokens are created/revoked via auth-core, responses unchanged, and records land in `tokens` (not `api_keys`); audit events still emitted.
- [ ] 5. Handle legacy `api_keys` migration/compatibility
  - Sanity check: migration/backfill script or compatibility shim is documented and tested so existing PATs either migrate to `tokens` or are clearly rejected with guidance; no orphaned secrets.

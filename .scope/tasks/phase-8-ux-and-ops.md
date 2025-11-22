# Phase 8 – UX & Operational Tools (Devices, PAT UI, Admin Actions)

Context to review:
- `docs/auth-migration/auth-migrate-phases.md` (Phase 8 section)
- `agent/steering/database/database-structure-rls-and-access-control.md` (workspace ownership/deletion)
- Existing endpoints: `/v1/auth/sessions`, `/v1/tokens`, audit logs/emitter, session/token revocation flows

- [x] 1. “Manage Devices” UI
  - Build web UI backed by `/v1/auth/sessions` + `DELETE /v1/auth/sessions/:id`.
  - Display device type, browser, approximate region (from IP), createdAt, lastUsedAt, session kind (persistent/default), current-session flag.
  - Action: revoke a session (logout that device), refresh list after revoke.
  - Sanity check: revoking another device does not kill current session; current session revoke logs out and clears refresh cookies.

- [ ] 2. “API Tokens” (PAT) UI
  - Build web UI backed by `/v1/tokens` endpoints (create/list/update/delete).
  - Show name, scopes, createdAt, lastUsedAt, expiry, masked token, workspace binding.
  - Actions: create (show plaintext once), rename, revoke; optional scope/workspace filters.
  - Sanity check: scoped tokens enforce/workspace binding still respected after UI actions; audit events emit for create/use/revoke/rename.

- [ ] 3. Admin/support tooling
  - Add internal/admin flows to revoke all sessions/refresh tokens for a user (“log out all devices”).
  - Add bulk PAT revocation per user and ensure audit events emit.
  - Provide a simple incident view (filter by userId/sessionId/tokenId/familyId) using existing structured logs or lightweight endpoint.
  - Sanity check: bulk revocation propagates to DB rows and clears cookies if current user; incident view redacts secrets.

- [ ] 4. Account deletion flows
  - Implement user-initiated delete that revokes sessions/refresh tokens/PATs and handles workspace ownership (transfer or orphan rules).
  - Apply retention/deletion policy hooks (soft-delete vs purge) per data class; update RLS as needed to block access post-delete.
  - Sanity check: deleted accounts cannot authenticate; owned workspaces handled per policy; audit trail recorded.

- [ ] 5. Docs & validation
  - Update auth docs with device/PAT UX, admin tools, and account deletion behavior.
  - Run: `pnpm --filter @repo/api typecheck`, `pnpm --filter @repo/web typecheck && pnpm --filter @repo/web build`, and relevant vitest/UI tests for new flows.

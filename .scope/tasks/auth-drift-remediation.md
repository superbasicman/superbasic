# Auth Drift Remediation Plan

Reference: `docs/auth-drift-findings.md` against `docs/auth-migration/end-auth-goal.md`. Scope is to align session scope enforcement, token formats, workspace rules, and missing surfaces (MFA/OAuth/logging).
Goal: land a clean, doc-aligned auth stack with no leftover legacy compatibility paths or dead code once remediation is complete.

- [x] 1. Restore scope invariants for sessions and PATs  
  - Sanity check: Requests using session auth are rejected without required scopes; PAT verification only grants stored scopes intersected with workspace roles (unit/integration tests in `apps/api/src/middleware/scopes.test.ts`). Note: API tests still need DB up to re-run locally.

- [x] 2. Align access/refresh/PAT token formats and hashing envelopes  
  - Sanity check: New tokens follow `<prefix>_<tokenId>.<secret>` with salt/key_id envelope persisted; legacy tokens remain valid (unit tests in `packages/auth/src/token-hash.test.ts`, `packages/auth-core/src/service.test.ts`). API tests require DB up to re-run.

- [x] 3. Enforce refresh rotation policy from goal (current-token only, tolerant reuse handling)  
  - Sanity check: Refresh reuse from a non-current token triggers expected family handling (per goal), with IP/UA heuristics tests covering benign race vs replay (integration in `apps/api/src/routes/v1/auth/refresh.test.ts`).

- [x] 4. Add access-token scopes claim and TTL alignment <!-- id: 4 -->  
  - Sanity check: Access tokens include scopes claim capped by workspace membership; default TTLs match goal (access 10m, refresh/session 30d) with config/tests updated in `packages/auth-core/src/signing.test.ts` and `apps/api` routes.

- [x] 5. Harden workspace selection and AuthContext shape <!-- id: 5 -->  
  - Remove "last workspace" fallback for security; multi-workspace users/PATs must provide explicit `X-Workspace-Id` header or fail with 400 error.
  - Workspace-scoped PATs use their bound workspace; user-scoped PATs with multiple workspaces require explicit header.
  - Reject requests with null workspace when user has multiple workspaces.
  - Implement explicit GUC clearing mechanism on middleware exit (both success and error paths).
  - Add pool wrapper that resets GUCs (`app.user_id`, `app.workspace_id`, `app.mfa_level`) before releasing connections to prevent tenant leakage.
  - Sanity check: AuthContext carries principalType/serviceId/clientId/allowedWorkspaces/mfaCompletedAt; PAT and user requests set GUCs via unified middleware; multi-workspace calls require explicit workspace; GUC isolation verified between concurrent requests (integration tests in `apps/api/src/middleware/auth-context.test.ts`).

- [x] 6. Service identities and OAuth surface completion  
  - Client credentials grant bound to ServiceIdentity with allowedWorkspaces enforcement.
  - OAuth adds `/oauth/revoke`, `/oauth/introspect`, `/openid/userinfo` endpoints with rate limits.
  - Implement `oauth_grants` table and consent screen for third-party clients (or explicitly document as deferred for post-v1 with first-party-only stance).
  - Verify `/.well-known/openid-configuration` and `/.well-known/jwks.json` are production-ready.
  - Sanity check: Client credentials/service principal auth flows enforced with allowedWorkspaces; OAuth revoke/introspect/userinfo endpoints operational; consent flow enforced for third-party clients or explicitly bypassed for first-party only (integration tests in `apps/api/src/routes/v1/oauth/*`).

- [x] 7. MFA enforcement and high-risk endpoint checks  
  - Sanity check: MFA challenge/verification endpoints exist; high-risk routes enforce required `mfaLevel` (tests in `apps/api/src/routes/v1/auth/mfa/*.test.ts` or equivalent).

- [ ] 8. Logging, audit, and rate-limit coverage  
  - Sanity check: Security events emitted for PAT creation, refresh reuse, MFA actions; rate limits cover OAuth authorize/token and PAT use; verified via tests/fixtures in `packages/auth/src/events.test.ts` and `apps/api/src/middleware/rate-limit/*`.

- [ ] 9. Remove legacy/compatibility paths and dead code, dead docs and scripts
  - Refactor sign-in routes (`signin.ts`, `google.ts`) to be "thin handlers" that delegate to `auth-core` instead of accessing Prisma directly, aligning with the `VerifiedIdentity` pattern.
  - Sanity check: Deprecated token prefixes/format handlers, unused service identity stubs, and bypass flags are removed or gated only by current formats; `pnpm lint`/`pnpm test -- --run` show no unused code warnings or references to legacy flows.

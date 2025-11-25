# Auth Alignment Check – Current Gaps vs End-State Goal

Date: 2025-xx-xx

## Context

- Based on docs/auth-migration/auth-migrate-phases.md (phases 1–9) and docs/auth-migration/end-auth-goal.md.
- Code reviewed across packages/auth-core, apps/api (middleware/routes), and packages/database schema/migrations.
- Focus: alignment to end-state auth architecture (JWT access, refresh rotation, PATs in tokens table, workspace-aware scopes/roles, IdP abstraction, PKCE/native flows, hardened cookies, RLS via Postgres GUCs).

## Findings

- 1. PATs still use legacy `api_keys` and bypass auth-core:
  - Verification happens in `apps/api/src/middleware/pat.ts` against `api_keys`, not `tokens`, and scopes are not intersected with workspace membership.
  - Auth-core PAT methods (`issuePersonalAccessToken`, `revokeToken`) are unimplemented (`packages/auth-core/src/service.ts:245-255`), so the new `tokens` table is unused for PATs.
  - `/v1/tokens` routes call legacy services (`apps/api/src/routes/v1/tokens/create.ts`), not auth-core, so PAT issuance/verification is not aligned with the end goal.

- 2. Scope/role enforcement is effectively disabled for session users:
  - `requireScope` skips checks when `authType === "session"` (`apps/api/src/middleware/scopes.ts:23-77`), making session callers bypass workspace roles/scopes derived by auth-core. This diverges from the goal that all callers use centralized authz.

- 3. OAuth/PKCE flow requires an existing access token and doesn’t use the IdP abstraction:
  - `/v1/oauth/authorize` returns 401 unless `c.get('auth')` is already set (`apps/api/src/routes/v1/oauth/authorize.ts:42-45`), instead of driving an IdP login. The `IdentityProvider` interface (`packages/auth-core/src/interfaces.ts`) is unused, so native/PKCE flows aren’t IdP-agnostic as intended.

- 4. `/v1/auth/token` still depends on an Auth.js session cookie instead of the unified IdP adapter:
  - The endpoint exchanges `authjs.session-token` via a custom loader (`apps/api/src/routes/v1/auth/token.ts`, `apps/api/src/lib/authjs-session.ts`) instead of using `IdentityProvider` and auth-core’s flow. This blocks the planned cookie-free, IdP-agnostic issuance.

- 5. Postgres GUCs are set on the shared Prisma client, not per-request transactions:
  - `setPostgresContext` is invoked on the global client (`packages/auth-core/src/service.ts:355-360`, `apps/api/src/middleware/auth-context.ts:92-110`), so `app.user_id/app.workspace_id` can leak across requests or be missing inside request-scoped transactions. RLS isolation is not reliable until this is transaction-scoped.

- 6. Refresh cookie hardening not at target:
  - Cookies are `sb.refresh-token`/`sb.refresh-csrf` with `Path=/v1/auth/refresh` and env-driven flags (`apps/api/src/routes/v1/auth/refresh-cookie.ts:6-35`). End goal calls for `__Host-*`, strict `Secure`/`SameSite` settings, and consistent pathing for Phase 7 hardening.

## Recommended next steps

1) Migrate PAT issuance/verification into auth-core and the `tokens` table; update `/v1/tokens` + middleware to call `AuthService.verifyRequest` and intersect scopes with workspace membership.  
2) Enforce scopes/roles for sessions by removing the session bypass in `requireScope`, using `AuthContext` scopes from auth-core.  
3) Wire the `IdentityProvider` abstraction into `/v1/auth/token` and `/v1/oauth/authorize` so PKCE/native login works without a pre-existing token, and drop the Auth.js session dependency.  
4) Bind `setPostgresContext` to per-request transactions (or request-scoped Prisma) before queries; then harden refresh cookies to the planned `__Host-` scheme with strict flags.

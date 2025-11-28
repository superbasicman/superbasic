# Auth Flow Reference

End-to-end map of how a request is authenticated and authorized. This follows the layering in `apps/api` and `packages/auth-core` and points to the specific functions that run in order.

## Top-level request plumbing (apps/api/src/app.ts)
- `app.use('*', requestIdMiddleware)` – seeds `c.get('requestId')`.
- `app.use('*', corsMiddleware)` – CORS preflight/headers.
- `app.use('*', attachAuthContext)` – attempts to build an auth context for every request (session or PAT).
- Routes under `/v1` use:
  - `unifiedAuthMiddleware` on routes that accept PATs or sessions (for example `/v1/me`, `/v1/tokens`).
  - `authMiddleware` on session-only routes (for example certain auth maintenance endpoints).
  - `requireScope` on scoped endpoints (for example `GET /v1/me` needs `read:profile` for PATs).

## Auth context bootstrap (apps/api/src/middleware/auth-context.ts)
- `extractBearer` – pulls a Bearer token from the `Authorization` header.
- `attachAuthContext(c, next)`:
  - If the Bearer starts with `sbf_`, it is a PAT → sets `c.set('auth', null)` and resets Postgres context, then returns to let `patMiddleware` handle it.
  - Builds `VerifyRequestInput` (URL, method, headers, IP, user-agent, workspace header/path, requestId).
  - Calls `authService.verifyRequest` (auth-core).
  - On success, sets `c` vars: `auth`, `userId`, `profileId`, `authType` (`pat` if `clientType === 'cli'`), `tokenScopes`, `tokenScopesRaw`, `tokenId` (from the PAT opaque token), and sets Postgres RLS context via `setPostgresContext`.
  - On failure, resets Postgres context and returns 401.

## PAT-only middleware (apps/api/src/middleware/pat.ts)
- `patMiddleware(c, next)` handles Bearer PATs directly:
  - Rate-limit check (`checkFailedAuthRateLimit`), otherwise 429.
  - Validates `Authorization` header, otherwise 401 + tracks failed auth.
  - Calls `authService.verifyRequest` (auth-core) with headers/workspace hints.
  - Parses opaque token to get `tokenId`, fetches token record scopes from Prisma, and builds `effectiveScopes` (prefers token record scopes, else auth-core scopes, else raw scopes).
  - Sets context vars: `auth` (with `scopes`), `userId`, `profileId`, `workspaceId`, `authType = 'pat'`, `tokenId`, `tokenScopes`, `tokenScopesRaw`, `userEmail`.
  - Calls `next`; on errors tracks failed auth and returns 401.

## Unified vs session middleware
- `unifiedAuthMiddleware` (apps/api/src/middleware/auth-unified.ts):
  - If `c.get('auth')` already exists (from `attachAuthContext`), continue.
  - If `Authorization` header contains Bearer, delegate to `patMiddleware`.
  - Otherwise, delegate to `authMiddleware`.
- `authMiddleware` (apps/api/src/middleware/auth.ts): simple guard that requires `c.get('auth')` to exist (session flow).

## Scope enforcement (apps/api/src/middleware/scopes.ts)
- `requireScope(requiredScope)`:
  - Session auth (`authType === 'session'`) bypasses scope checks.
  - PAT auth (`authType === 'pat'` or `clientType === 'cli'`):
    - Logs evaluation (requiredScope, authScopes, tokenScopesRaw/tokenScopes, tokenId).
    - Uses scopes from `auth.scopes` if present, otherwise `tokenScopesRaw`.
    - Allows if `admin` is present or the required scope is present; else returns 403 JSON `{ error: "Insufficient permissions", required }`.
  - For other contexts, uses `authz.requireScope` or token scopes similarly.

## Auth-core service (packages/auth-core/src/service.ts)
- `verifyRequest(input: VerifyRequestInput)`:
  - Extracts Bearer token; if opaque PAT, routes to `verifyPersonalAccessToken`.
  - Otherwise verifies JWT access token, checks claims, resolves workspace context, and builds `AuthContext` with `scopes`, `roles`, `userId`, `profileId`, `activeWorkspaceId`, `clientType`, `recentlyAuthenticatedAt`.
- `verifyPersonalAccessToken({ tokenId, tokenSecret, request })`:
  - Loads token from `tokens` table, verifies type, hash, revocation, expiry, and active user.
  - Resolves workspace context (forced by token.workspaceId or hinted headers/path).
  - Computes `requestedScopes = token.scopes`.
  - `scopes = intersectScopes(workspaceResolution.scopes, requestedScopes)`.
  - If `admin` was requested, re-add `admin` even if not in workspace scope intersection.
  - Returns `AuthContext` with `clientType: 'cli'`, `sessionId: null`, `scopes`, `roles`, `activeWorkspaceId`, `profileId`, `mfaLevel: 'none'`, and sets Postgres context via `setContext`.
- `issuePersonalAccessToken(input)`:
  - Generates opaque token (`tokenId.tokenSecret`), hashes secret, stores in `tokens` with `scopes`, optional `workspaceId`, `expiresAt`, and returns plaintext secret + metadata.

## API auth routes (apps/api/src/routes/v1/auth/*)
- Session/JWT issuance and maintenance:
  - `/v1/auth/token` → `exchangeAuthTokens` (issue access/refresh).
  - `/v1/auth/refresh` → `refreshTokens`.
  - `/v1/auth/logout` → `logout`.
  - `/v1/auth/sessions` → list/delete sessions.
  - `/v1/auth/sso/logout` → SSO logout.
  - `getCurrentSession` → returns current session data.
- All session routes rely on `attachAuthContext` + `authMiddleware`; PATs are not used here.

## PAT CRUD routes (apps/api/src/routes/v1/tokens/*)
- Mounted under `/v1/tokens`; use `unifiedAuthMiddleware` so PATs can manage PATs (if allowed) and sessions can manage PATs.
- Enforce scopes via `requireScope` depending on verb and payload (e.g., create/revoke/list tokens).
- Delegate business logic to token services (`packages/core` service layer) but use auth context for ownership and scope checks.

## How a PAT request flows (happy path)
1) `Authorization: Bearer sbf_<id>.<secret>` hits API.
2) `attachAuthContext` sees PAT prefix → sets `auth = null` and skips (Postgres context reset).
3) `unifiedAuthMiddleware` sees Bearer → calls `patMiddleware`.
4) `patMiddleware` calls `authService.verifyRequest` → `verifyPersonalAccessToken` (auth-core) loads token, checks hash/expiry/revocation, resolves workspace, computes scopes (`admin` preserved).
5) `patMiddleware` attaches `auth` with scopes and `tokenScopesRaw` to context, plus identifiers.
6) Route handler runs; `requireScope` enforces required scope using `auth.scopes`/`tokenScopesRaw`.
7) Service/repo layers execute with Postgres context set to the authenticated user/profile/workspace.

## How a session (JWT) request flows
1) `attachAuthContext` sees non-PAT Bearer (or cookies, depending on handler), calls `authService.verifyRequest` → JWT verification path, resolves workspace, builds `AuthContext`.
2) `authMiddleware` (or `unifiedAuthMiddleware` falling back to `authMiddleware`) requires `auth` to exist.
3) `requireScope` bypasses scope enforcement for sessions (full access), relying on app-level authorization in services/routes.
4) Service/repo layers run with Postgres context for the session user/profile/workspace.

## Current caution (admin PAT gap)
- Observed: admin PAT tokens are stored with `['admin']`, but `auth.scopes` was arriving empty in API context, causing 403 on `GET /v1/me`. Ensure the auth-core/pat middleware path preserves token scopes (including `admin`) in `auth.scopes`/`tokenScopesRaw`; avoid relying on downstream fallbacks to pass admin.

# Current Auth Implementation

This document explains how authentication works today across the SuperBasic codebase. It is written for someone with no prior context and points to concrete files for each concern.

## High-Level Architecture
- **API service (`apps/api`)** runs on Hono. All requests flow through common middleware: request IDs, CORS, `attachAuthContext`, and endpoint-specific rate limits (app.ts).
- **Auth libraries** are split between `packages/auth` (Auth.js configuration, password/PAT utilities, magic-link email, auth events) and `packages/auth-core` (JWT signing/verification, refresh token service, scope/role resolution, OAuth helpers).
- **Persistence** uses Postgres via Prisma models in `packages/database/schema.prisma`. Key tables: `users`, `user_identities`, `accounts`, `sessions`, `tokens` (refresh + PAT), `verification_tokens`, `oauth_clients`, `oauth_authorization_codes`.
- **Audit/telemetry** is emitted via `authEvents` (`packages/auth/src/events.ts`) for logins, token issuance, revocations, and rate-limit blocks.

## Request Authentication Pipeline (API)
- `attachAuthContext` (`apps/api/src/middleware/auth-context.ts`) runs on every request. It:
  - Extracts `Authorization` (Bearer) and optional workspace hints (`x-workspace-id` header or `workspaceId` path param).
  - Calls `authService.verifyRequest` (`@repo/auth-core`) which accepts either an access JWT or a personal access token (PAT). PATs start with `sbf_` and are parsed/verified against the `tokens` table; access JWTs are verified and their session checked for expiry/revocation.
  - Resolves workspace context/roles/scopes from membership, sets Postgres RLS context, and stores `auth`, `userId`, `profileId`, and scope details on the Hono context. PAT requests set `authType="pat"`, others default to session.
- **Middleware**:
  - `authMiddleware` enforces presence of `auth`.
  - `patMiddleware` authenticates PATs (used by `unifiedAuthMiddleware` when a Bearer token is present) and augments scopes with any stored on the token record.
  - `unifiedAuthMiddleware` chooses PAT-first, otherwise session auth.
  - `requireScope` middleware (`apps/api/src/middleware/scopes.ts`) enforces permission scopes for PAT/CLI clients; session auth currently bypasses scope enforcement (full access).
- **CORS**: `authApp` manually re-applies CORS headers to Auth.js responses so cross-origin cookie flows work (`apps/api/src/auth.ts`).

## Identity & Session Data Model
- **users**: core identity; `password` stored as bcrypt hash (`packages/auth/src/password.ts`). `status` must be `active` to authenticate.
- **user_identities / accounts**: link external providers (Google, magic link) and store provider user IDs + email verification state.
- **sessions**: stored per login with opaque `tokenId` + HMAC hash of the secret, expiry timestamps (30-day sliding window, 180-day absolute cap), client type, lastUsedAt, mfaLevel, and revocation timestamp.
- **tokens**: unified table for refresh tokens and PATs; stores HMAC hash envelope, type (`refresh` or `personal_access`), optional scopes/name/workspace binding, familyId for rotation, expiry, and revocation metadata.
- **verification_tokens**: hashed magic-link/email verification tokens for Auth.js email provider.
- **oauth_clients / oauth_authorization_codes**: first-party OAuth server clients and short-lived PKCE-bound codes (hash stored, deleted on consume).

## Auth Entry Points & Flows
### 1) User registration (`POST /v1/register`)
- Validates email/password, hashes password with bcrypt, creates user + default profile, emits `user.registered` (`packages/core/src/users/user-service.ts`). Does not issue tokens; clients must log in afterwards.

### 2) Auth.js interactive flows (`/v1/auth/*`, `apps/api/src/auth.ts`, `packages/auth/src/config.ts`)
- Providers: Credentials (`authjs:credentials`), Google OAuth (`authjs:google`), and email magic link (`authjs:email`).
- Session strategy: Auth.js uses `jwt` sessions but also persists a server-side session row via `persistSessionToken` so opaque tokens still work. Cookie name `authjs.session-token` (httpOnly, SameSite=Lax, Secure in prod).
- JWT encode/decode is overridden so the session cookie actually holds an **access JWT** (15m TTL) when available; fallback to default Auth.js JWT encoding otherwise.
- Sign-in callback (`maybeIssueAuthCoreSession` in `apps/api/src/auth.ts`):
  - Extracts the Auth.js session cookie (opaque or JWT).
  - Validates session (hash compare if opaque, or JWT verify) and finds user/session record.
  - Issues a refresh token via `authService.issueRefreshToken`, sets refresh + CSRF cookies, and attaches an access token in `X-Access-Token`/`X-Access-Token-Expires-In` headers for SPA bootstrap.
- Magic link emails are sent through Resend (`packages/auth/src/email.ts`); rate limited to 3/hour/email.
- Credentials callback path is rate limited to 5/min/IP. Other Auth.js endpoints inherit general auth rate limiting.

### 3) Direct credential login API (`POST /v1/auth/login`)
- Independent of Auth.js, accepts JSON email/password, validates against bcrypt hash, and rejects inactive users.
- Creates a session + refresh token through `authService.createSessionWithRefresh` (auth-core) with optional `rememberMe` and `clientType`.
- Returns `{ accessToken, refreshToken, expiresIn, sessionId }` and sets refresh/CSRF cookies (`setRefreshTokenCookie`). Emits `user.login.success`/`failed` events with IP/UA metadata. Rate limited (10/min/IP).

### 4) Access & refresh tokens
- **Access tokens (JWT)**: signed by auth-core (`packages/auth-core/src/signing.ts`) using EdDSA or RS256 from env keys; 15 minute TTL by default. Claims: `sub` (user), `sid` (session), `wid` (workspace), `token_use=access`, `client_type`, `mfa_level`, `reauth_at`, `jti`, `iss`, `aud`. JWKS exposed at `/v1/auth/jwks.json` and `/.well-known/jwks.json`.
- **Refresh tokens (opaque)**: issued by `TokenService.issueRefreshToken` (`packages/auth-core/src/token-service.ts`), stored hashed in `tokens` with type `refresh`, bound to a session and optional `familyId`. Expiry matches the session window; metadata captures source/IP/UA.
- **Rotation (`POST /v1/auth/refresh`)**: validates HMAC hash, ensures token/session not expired/revoked, updates session `lastUsedAt` and sliding expiry (7d window unless persistent), revokes the used token, and mints a new refresh token within the same family. Reuse of a revoked token revokes the whole family + session and emits `refresh.reuse_detected` + `session.revoked`. Double-submit CSRF is required when using the refresh cookie.
- **Cookies**: `sb.refresh-token` (or `__Host-sb.refresh-token` in prod) httpOnly; companion CSRF cookie `sb.refresh-csrf` readable by JS. Path `/v1/auth/refresh` in dev, `/` in prod; `SameSite` defaults to Lax unless overridden via `AUTH_COOKIE_SAMESITE`.

### 5) Logout & session management
- **Logout (`POST /v1/auth/logout`)**: requires authenticated session, validates CSRF if a refresh cookie exists, calls `revokeSessionForUser` to revoke session + refresh tokens, clears refresh cookies, emits `user.logout`.
- **List/delete sessions** (`GET/DELETE /v1/auth/sessions`): lists active sessions for the user; deleting a session requires `requireRecentAuth` (recent login within 15m) and revokes matching refresh tokens. Clearing the current session also clears refresh cookies.
- **Bulk revoke**: `/v1/auth/sessions/revoke-all` (all sessions) and `/v1/auth/tokens/revoke-all` (all PATs) also require recent auth.
- **SSO logout**: `/v1/auth/sso/logout` consumes back-channel logout events (provider + providerUserId) and revokes mapped sessions using `planBackChannelLogout` (`packages/auth-core/src/sso.ts`).

### 6) Personal Access Tokens (PATs) & API key management
- PAT format: `sbf_<base64url>` (256-bit secret). Hash stored via HMAC envelope; plaintext shown once on creation (`packages/auth/src/pat.ts`, `apps/api/src/lib/pat-tokens.ts`).
- Created via `POST /v1/tokens` (session auth only, scope `write:accounts`, 10/hour rate limit). Name uniqueness enforced per user; expiry default 90 days (min 1, max 365). Metadata stores last4 for display.
- Listing/updating/revoking via `/v1/tokens` routes; revocations call `authService.revokeToken` and emit audit events.
- Usage: `Authorization: Bearer <PAT>`; `patMiddleware` verifies with `authService.verifyRequest`, loads stored scopes, and sets `authType="pat"` plus `tokenId/tokenScopes` on context. Workspace can be forced on the token or derived from header/path membership.

### 7) First-party OAuth 2.0 (authorization code + PKCE)
- Endpoints: `/v1/oauth/authorize` (requires existing auth context) and `/v1/oauth/token`.
- Authorization: validates client (must match allowed redirect URIs), normalizes scopes (from `@repo/types`), issues short-lived code (10m) hashed in DB.
- Token exchange: validates code hash, PKCE verifier, and redirect URI, then creates a session + refresh token via auth-core and returns access/refresh tokens. Client type defaults to `mobile` only for a `mobile` client_id; otherwise `other`.

## Token Verification & Authorization (auth-core)
- `AuthCoreService.verifyRequest` (`packages/auth-core/src/service.ts`) handles both access JWTs and PATs:
  - JWT path: verifies signature/claims, checks session existence/expiry/revocation, enforces active user.
  - PAT path: validates HMAC hash, revocation/expiry, and user status.
  - Resolves workspace context: header `x-workspace-id`, path `workspaceId`, or token hint; ensures membership via `workspace_members` and maps roles (`owner|admin|member|viewer`) to scopes (`authz` in `auth-core/src/authz.ts`). Falls back to latest workspace or null with global scopes (`read:profile`, `write:profile`, `read:workspaces`).
  - Sets Postgres RLS context (`setPostgresContext`) with user/profile/workspace/mfa.
- Access token signing config is loaded from env (`packages/auth-core/src/config.ts`): issuer/audience defaults to `AUTH_URL`/`<issuer>/v1`, algorithms EdDSA or RS256, key IDs and additional verification keys supported.
- `generateAccessToken` helper signs tokens using the active key; JWKS exposes all verification keys.

## Rate Limiting (auth-related)
- General auth endpoints (`/v1/auth/login|refresh|logout|sso/logout`): 10 req/min/IP; refresh endpoint elevated to 30 req/min/IP (`authRateLimitMiddleware`).
- Auth.js credentials callback: 5/min/IP (`credentialsRateLimitMiddleware`).
- Magic link requests: 3/hour/email (`magicLinkRateLimitMiddleware`).
- PAT auth failures tracked per IP (100 failed attempts/hour) to optionally block abuse (`failed-auth-tracking.ts`), emitting `auth.failed_rate_limited`.
- Token creation: 10 tokens/hour/user (`tokenCreationRateLimitMiddleware`).

## Cookies, Headers, and CSRF
- Auth.js sets `authjs.session-token` and `authjs.csrf-token` cookies (httpOnly, SameSite=Lax, Secure in prod).
- Refresh flow uses `sb.refresh-token` (+ host prefix in prod) httpOnly cookie and non-httpOnly `sb.refresh-csrf` for double-submit. The refresh CSRF token is also echoed in `X-Refresh-Csrf` header after Auth.js callbacks for SPAs.
- Access tokens are returned in JSON bodies for login/refresh and via `X-Access-Token` headers during Auth.js callback bridging.

## Events & Auditing
- `authEvents` fire-and-forget events include login success/failure, logout, session revoked, refresh rotation/reuse detection, PAT created/updated/revoked/used/scope denied, and rate-limit violations. IP, UA, requestId, sessionId, and timestamps are attached where available (`packages/auth/src/events.ts`).

## Key Environment Variables
- **Secrets/keys**: `AUTH_SECRET` (Auth.js), `TOKEN_HASH_KEYS` (JSON map for HMAC keys; fallback `TOKEN_HASH_FALLBACK_SECRET`/`AUTH_SECRET`), `AUTH_JWT_PRIVATE_KEY` or `_FILE`, `AUTH_JWT_ALGORITHM`, `AUTH_JWT_KEY_ID`, `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`.
- **Cookies**: `AUTH_COOKIE_SAMESITE`, `AUTH_COOKIE_SECURE`, `AUTH_COOKIE_DOMAIN` influence refresh cookies; prod uses `__Host-` prefix automatically.
- **Providers**: `GOOGLE_CLIENT_ID/SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `AUTH_URL`, `WEB_APP_URL`.
- **Rate limiting**: `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` enable Redis-backed rate limits; without them limits are skipped (dev/test).

## Notable Gaps/Behaviors to Be Aware Of
- `AuthCoreService.revokeSession` is not yet implemented; session revocation happens via API helpers (`revokeSessionForUser`) rather than core service.
- Scope enforcement middleware currently bypasses checks for session-based requests (`authType === "session"`), so only PAT/CLI requests are scoped; sessions effectively have full access.
- `attachAuthContext` relies on Bearer tokens; the Auth.js session cookie alone is not read on API endpoints, so clients must use the issued access token (and refresh flow) to authenticate API calls.

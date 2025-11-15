# Auth Migration Phases (`auth-migrate-phases.md`)

This document scopes the implementation of the SuperBasic Finance auth architecture into concrete phases that can be scheduled and tracked.

- Goal: Turn the high-level `auth-plan.md` into a deliverable set of milestones.
- Out of scope: Deep migration strategy from existing implementation (covered elsewhere).

---

## Phase 1 – Core Data Model & Auth-Core Skeleton

**Objective**

Create the shared domain models, DB schema, and the `auth-core` package skeleton with types and interfaces, but no real token logic.

**Includes**

- DB schema / migrations for:
  - `User` (or mapping to `profiles`), including:
    - `id`
    - `email`
    - `status` (`active`, `disabled`, `locked`, etc.)
  - `UserIdentity`:
    - `id`, `userId`, `provider`, `providerUserId`, metadata.
  - `Session`:
    - `id`, `userId`, `type`, `kind`, `createdAt`, `lastUsedAt`, `expiresAt`, `absoluteExpiresAt`, `revokedAt`, `mfaLevel`.
  - `Token` (refresh + PATs):
    - `id`, `userId`, `sessionId`, `type`, `tokenHash`, `scopes`, `name`, `createdAt`, `lastUsedAt`, `expiresAt`, `revokedAt`, `familyId`, `metadata`, `workspaceId`.
  - `Workspace`, `WorkspaceMembership`:
    - `Workspace`: `id`, `name`, `status`.
    - `WorkspaceMembership`: `workspaceId`, `userId`, `role`.
  - `OAuthClient` stub:
    - `id` / `clientId`, `type`, `name`, `redirectUris`, `createdAt`, `disabledAt`.

- `packages/auth-core` scaffolding:
  - Types:
    - `AuthContext`, `ClientType`, `VerifiedIdentity`, `PermissionScope`.
  - Interfaces:
    - `IdentityProvider` (Auth.js/Auth0/etc behind this).
    - `AuthService` public surface (method signatures only).
    - `AuthzService` public surface (authorization helpers).
  - Basic error types:
    - `UnauthorizedError`, `AuthorizationError`, etc.

- Integration:
  - `apps/api` imports `AuthContext` type.
  - Very thin placeholder middleware that sets `c.var.auth = null` for now.

**Out of scope**

- Token generation/verification.
- Refresh rotation, PAT logic, OAuth flows.
- RLS and heavy auth middleware.

**Exit criteria**

- Migrations run successfully and tables exist.
- `auth-core` package builds and exports:
  - Core types.
  - Interface signatures.
- API can compile using `AuthContext` without any token logic wired.

---

## Phase 2 – Access Tokens, Sessions & Basic AuthContext

**Objective**

Issue and validate short-lived JWT access tokens, create sessions, and build a minimal `AuthContext` for web clients.

**Includes**

- Access token implementation:
  - Choose algorithm (EdDSA / RS256).
  - Implement signing and verification utilities in `auth-core`.
  - Claims:
    - `iss`, `aud`, `sub` (userId), `sid` (sessionId), `wid` (workspace hint), `token_use`, `act`, `jti`, `exp`, `iat`.
  - Header:
    - `kid` support.
  - Implement JWKS JSON generation code.
- Replace the legacy Auth.js session cookie entirely:
  - After IdP login completes, call a new `POST /v1/auth/token` endpoint that returns a JWT access token (and, later, refresh token).
  - Document the new flow so the SPA immediately adopts `Authorization: Bearer` and no cookies are emitted for auth.

- JWKS endpoints:
  - `GET /.well-known/jwks.json`
  - `GET /v1/auth/jwks.json` (alias)

- Session creation for existing login flow:
  - When current IdP (e.g. Auth.js) completes login:
    - Create a `Session` row with:
      - `type = 'web'`
      - `kind` based on “remember me” UX.
      - `createdAt`, `expiresAt`, `absoluteExpiresAt`.

- Initial `AuthService.verifyRequest`:
  - Accepts:
    - Authorization header (Bearer access token).
    - Request metadata (ip, userAgent, url, headers).
  - Verifies JWT, checks:
    - Signature, algorithm.
    - `iss`, `aud`, `exp`, `iat`.
  - Loads:
    - `User` and `Session` (if `sid` present).
  - Validates:
    - `User.status === 'active'`.
  - Builds `AuthContext`:
    - `userId`
    - `sessionId`
    - `clientType` derived from session (`web`).
    - `activeWorkspaceId` using a simple default workspace for now.
    - `scopes` and `roles` can be empty or stubbed.
- Postgres session variables:
  - Immediately set `app.user_id` / `app.profile_id` (and a placeholder `app.workspace_id = NULL`) whenever `AuthService.verifyRequest` succeeds so existing RLS policies start protecting data even before workspace-aware logic lands.

- Hono middleware:
  - Extracts `Authorization: Bearer`.
  - Calls `AuthService.verifyRequest`.
  - Sets `c.var.auth` to `AuthContext` or `null`.

- `GET /v1/auth/session`:
  - Returns:
    - User info (id, email, name).
    - Session info (id, type, kind, createdAt, lastUsedAt, expiresAt, absoluteExpiresAt).
    - Placeholder `activeWorkspaceId`, `roles`, `scopes`, `mfaLevel`.

**Out of scope**

- Refresh tokens, PATs.
- Workspace-aware scopes and roles.
- Mobile/PKCE flows.

**Exit criteria**

- Web SPA can:
  - Obtain a JWT access token after login.
  - Call a protected endpoint using `Authorization: Bearer`.
- Handlers can read `c.var.auth.userId` reliably.
- API routes that previously depended on `apps/api/src/middleware/auth.ts` now call into `auth-core` for token verification (cookie middleware can be deleted once the new flow is live).

---

## Phase 3 – Refresh Tokens & Session Lifecycle

**Objective**

Add long-lived sessions via refresh tokens with rotation, reuse detection, and logout semantics.

**Includes**

- Refresh token generation and storage:
  - Opaque random strings (256-bit).
  - Hash with SHA-256 (+ optional pepper).
  - Populate `Token` rows:
    - `type = 'refresh'`
    - `userId`, `sessionId`, `tokenHash`, `familyId`, `expiresAt`, `createdAt`, `revokedAt`.
  - DB constraint:
    - Partial unique index on `(familyId)` where `revokedAt IS NULL`.

- `/v1/auth/token` endpoint:
  - Input:
    - Current login proof (Auth.js / IdP adapter).
  - Flow:
    - Convert IdP result to `VerifiedIdentity`.
    - Apply identity linking rules:
      - Find or create `User`.
      - Create or update `UserIdentity`.
    - Create `Session`.
    - Issue:
      - Access token (JWT).
      - Refresh token (opaque).
    - Return:
      - `accessToken`, `refreshToken`, `expiresIn`.

- `/v1/auth/refresh` endpoint:
  - Accepts refresh token (body or HttpOnly cookie).
  - Hash + lookup `Token` with `type = 'refresh'`.
  - Validate:
    - Exists.
    - `revokedAt IS NULL`.
    - `expiresAt > now`.
    - Associated `Session`:
      - Not revoked.
      - Not expired (`expiresAt`, `absoluteExpiresAt`).
    - `User.status === 'active'`.
  - On success:
    - Rotate refresh token:
      - Mark old token `revokedAt = now`.
      - Create new token with same `familyId` and updated `expiresAt` (bounded by session).
    - Update session:
      - `lastUsedAt`.
      - `expiresAt` (sliding window).
    - Issue new access token.
    - Return new pair.

- Reuse detection:
  - If a refresh token is presented that is:
    - Found but `revokedAt IS NOT NULL`, and
    - Another active token in same `familyId` exists:
      - Revoke all tokens in that family.
      - Revoke `Session`.
      - Log a high-severity incident.
      - Return `invalid_grant` (401).
  - If no active sibling exists:
    - Treat as stale / post-logout.
    - Return `invalid_grant` (401) and log at lower severity.

- `/v1/auth/logout` endpoint:
  - Revokes:
    - Current `Session`.
    - All refresh tokens for that session (`familyId`).
  - Clears refresh cookies for web clients (if used).

- `/v1/auth/sessions` and `DELETE /v1/auth/sessions/:id`:
  - List active sessions for current user.
  - Revoke a specific session and its refresh tokens.

**Out of scope**

- PATs.
- Complex multi-tenant workspace semantics.
- Native OAuth/PKCE.

**Exit criteria**

- SPA:
  - Logs in, gets access + refresh.
  - Can refresh successfully.
  - Cannot refresh after logout (refresh token invalid).
- Session list and remote logout work via API.

---

## Phase 4 – Scopes, Roles & Multi-Tenant Workspace Semantics

**Objective**

Implement proper authorization via roles and scopes, with multi-tenant workspace isolation.

**Includes**

- Role-to-scope mapping:
  - Define a central mapping, e.g.:
    - `owner`, `admin`, `member`, `viewer`.
    - Map each to a set of scopes (e.g. `read:transactions`, `write:transactions`, etc.).
  - Store as code or config (or later in DB).

- `AuthzService` implementation:
  - Helpers:
    - `requireScope(auth, scope)`
    - `requireAnyScope(auth, scopes)`
    - `requireWorkspaceRole(auth, role)`
  - Throw `AuthorizationError` with enough context.

- Workspace selection semantics:
  - For each request:
    - If route has `:workspaceId` param:
      - Use that as `activeWorkspaceId`.
    - Else if header `X-Workspace-Id` is present:
      - Use that.
    - Else:
      - Use user default/last-used workspace.
  - Validate membership:
    - `WorkspaceMembership(userId, activeWorkspaceId)` must exist.
  - Derive:
    - `roles` from membership.
    - `scopes` from role-to-scope mapping.
  - Clarify that hints in JWT (`wid`) do not override path/header rules.

- `AuthService.verifyRequest` updates:
  - After token verification and user/session checks:
    - Resolve `activeWorkspaceId` via rules above.
    - Fetch membership and roles.
    - Compute scopes:
      - Workspace-scoped scopes for `activeWorkspaceId`.
      - Global scopes (e.g. `read:profile`) regardless of workspace.
    - Populate `AuthContext` accordingly.

- Refactor API & services:
  - Replace adhoc checks like:
    - "is this user owner of this workspace" with `AuthzService` calls.
  - Ensure all workspace-aware queries:
    - Accept `workspaceId` explicitly.
    - Use `AuthContext.activeWorkspaceId` where appropriate.

- RLS groundwork:
  - Extend the Phase 2 GUC plumbing so that once `activeWorkspaceId` is known, requests set `app.workspace_id` (and `app.mfa_level` when available) before touching the database.
  - Expand the RLS coverage now that the session variables are populated for every request.

**Out of scope**

- PATs and external automation.
- Full RLS rollout for all tables (this can continue iteratively).

**Exit criteria**

- APIs consistently use `AuthContext` and `AuthzService` for workspace-level authorization.
- Multi-tenant isolation is enforced at both service and DB levels for the most sensitive tables.

---

## Phase 5 – Personal Access Tokens (PATs) & Token Management Endpoints

**Objective**

Introduce PATs for CLI/automation and complete the `/v1/tokens` API surface.

**Includes**

- PAT creation and storage:
  - Generate tokens with prefix like `sbf_`.
  - Store SHA-256 hash (+ optional pepper).
  - Use `Token` rows with:
    - `type = 'personal_access'`
    - `userId`, `tokenHash`, `scopes`, `workspaceId`, `name`, `createdAt`, `expiresAt`, `lastUsedAt`, `revokedAt`.
  - Store short prefix for masked display.

- PAT request verification (existing `/v1/tokens` + middleware migrate to auth-core):
  - Extend `AuthService.verifyRequest`:
    - Distinguish tokens by prefix.
    - For PATs:
      - Lookup `Token` with `type = 'personal_access'`.
      - Validate:
        - Not revoked.
        - Not expired.
        - `User.status === 'active'`.
      - Resolve workspace:
        - If `token.workspaceId` is set, force `activeWorkspaceId` to that.
        - Else use standard workspace selection rules.
      - Validate membership and scopes:
        - Intersect PAT scopes with role-derived scopes.
      - Build `AuthContext`:
        - `sessionId = null`.
        - `clientType = 'cli'` or `'partner'`.

- `/v1/tokens` endpoints (already live today) are reimplemented to call the new auth-core services so there is a single source of truth:
  - `POST /v1/tokens`:
    - Inputs:
      - Name, scopes, optional workspace binding, optional expiry.
    - Outputs:
      - PAT plaintext (shown once).
      - Metadata.
  - `GET /v1/tokens`:
    - List PATs:
      - Name, scopes, masked token, `createdAt`, `lastUsedAt`, `expiresAt`, `workspaceId`.
  - `DELETE /v1/tokens/:id`:
    - Revoke PAT.
  - `PATCH /v1/tokens/:id`:
    - Rename PAT.

- Logging:
  - PAT creation, usage (throttled `lastUsedAt` updates), revocation.

**Out of scope**

- UI for managing PATs (handled in a UX-focused phase).
- Third-party OAuth client-credential flows.

**Exit criteria**

- PATs can be created via API and used by CLI/automation.
- PATs correctly respect workspace and scope constraints.
- The legacy PAT middleware in `apps/api/src/middleware/pat.ts` is removed or reduced to a thin wrapper that delegates to `AuthService.verifyRequest`.

---

## Phase 6 – OAuth/PKCE for Native Apps & IdP Abstraction

**Objective**

Support fully native iOS/Android login via OAuth 2.1 Authorization Code + PKCE and formalize IdP abstraction.

**Includes**

- `IdentityProvider` abstraction:
  - Implement adapter for current IdP (e.g. Auth.js):
    - Methods returning `VerifiedIdentity`:
      - `authenticateWithCredentials`
      - `handleOAuthCallback`
      - `verifyMagicLink`, etc. (as needed).
  - Ensure `/v1/auth/token` and `/v1/oauth/authorize` call into this interface.

- `/v1/oauth/authorize`:
  - Accepts:
    - `response_type=code`
    - `client_id`
    - `redirect_uri`
    - `code_challenge`
    - `code_challenge_method`
    - `scope` (optional)
  - Flow:
    - Drive user through IdP login flow (web-based).
    - On success, generate short-lived, single-use auth code bound to:
      - `userId`, `clientId`, `redirectUri`, `code_challenge`, `requestedScopes`.
    - Redirect to `redirect_uri?code=...`.

- `/v1/oauth/token`:
  - Accepts:
    - `grant_type=authorization_code`
    - `code`
    - `client_id`
    - `redirect_uri`
    - `code_verifier`
  - Validates:
    - Auth code exists and not used/expired.
    - `client_id` and `redirect_uri` match.
    - PKCE `code_verifier` matches `code_challenge`.
  - On success:
    - Creates `Session` (`type = 'mobile'`).
    - Issues access + refresh tokens.
  - Deletes auth code (single-use).

- `OAuthClient` handling:
  - Seed at least one client:
    - `client_id = 'mobile'`, type `public`, with allowed `redirectUris`.
  - Validation in `/v1/oauth/authorize` and `/v1/oauth/token`.

- ClientType refinements:
  - For sessions created via `/v1/oauth/token` with `client_id = 'mobile'`:
    - `clientType = 'mobile'`.

**Out of scope**

- New IdP vendor (still using existing IdP).
- Enterprise SSO / SAML.

**Exit criteria**

- Native mobile apps:
  - Use system browser to hit `/v1/oauth/authorize`.
  - Receive auth code via custom URL scheme.
  - Exchange code for tokens via `/v1/oauth/token`.
- Same API surface as web once tokens are obtained.

---

## Phase 7 – Security Hardening (Cookies, CSRF, Rate Limits, Audit, Keys)

**Objective**

Harden the system: cookie strategy, CSRF protection, rate limiting, logging, and key rotation.

**Includes**

- Cookie & CORS strategy (for web/Capacitor):
  - Decide whether refresh tokens live in HttpOnly cookies.
  - Configure:
    - `HttpOnly`, `Secure`, `SameSite`, `Domain`, `Path`.
  - Update frontend to:
    - Use `credentials: 'include'` when needed.
  - CORS configuration:
    - Allowed origins (e.g. `https://app.superbasic.finance`).
    - `Access-Control-Allow-Credentials: true`.
    - Allowed headers.

- CSRF protection:
  - For endpoints relying on cookies (e.g. `/v1/auth/refresh`, `/v1/auth/logout`):
    - Require CSRF token (double-submit cookie + header) or a non-simple custom header.
  - Ensure these endpoints are not callable via cross-site forms without checks.

- Rate limiting:
  - Per-IP and per-user rate limits on:
    - Login, `/v1/auth/token`, `/v1/auth/refresh`, `/v1/tokens` creation.
  - Implement using existing rate-limit middleware or new infrastructure.

- Logging & auditing:
  - Structured events for:
    - Login success/failure.
    - Token creation/rotation.
    - Refresh token reuse detection.
    - Session revocation.
    - PAT create/update/delete.
    - Account status changes (`disabled`, `locked`).
  - Ensure no full tokens are logged.
  - Consider IP / user agent truncation or anonymization per privacy policy.

- Key management & rotation:
  - Ensure signing keys are KMS-backed.
  - Document and implement:
    - Regular rotation cadence.
    - Emergency rotation process.
    - JWKS update/retention behavior.

- RLS refinement:
  - Expand RLS to remaining sensitive tables.
  - Verify all workspace-scoped tables obey `app.workspace_id`.

**Out of scope**

- MFA & step-up authentication logic.
- Big UX changes beyond necessary security prompts.

**Exit criteria**

- Security review of auth passes agreed-upon baseline.
- Cookies, CORS, and CSRF behavior are consistent and documented.
- Rate limits and logging are in place for incident response.

---

## Phase 8 – UX & Operational Tools

**Objective**

Expose auth capabilities to end users and support, and make it easy to operate the system.

**Includes**

- “Manage Devices” UI:
  - Backed by `/v1/auth/sessions` and `DELETE /v1/auth/sessions/:id`.
  - Show:
    - Device type, browser, approximate region (from IP), createdAt, lastUsedAt, session kind.
  - Actions:
    - Revoke sessions (log out other devices).

- “API Tokens” / PAT UI:
  - Backed by `/v1/tokens` endpoints.
  - Show:
    - Name, scopes, createdAt, lastUsedAt, expiry, masked token, workspace binding.
  - Actions:
    - Create, rename, revoke PATs.

- Admin / support tools:
  - “Log out user from all devices”:
    - Bulk session and refresh token revocation by `userId`.
  - “Revoke all PATs for user”.
  - Simple incident-view:
    - Filter logs by `userId`, `sessionId`, `tokenId`, `familyId`.

- Account deletion flows:
  - Use existing revocation primitives:
    - All sessions, refresh tokens, PATs.
  - Handle workspace ownership cases:
    - Orphaned or reassigned workspaces.
  - Apply data retention/deletion policies as required.

**Out of scope**

- New security primitives.
- Enterprise-only admin dashboards.

**Exit criteria**

- Users can self-manage devices and API tokens.
- Support can respond quickly to “compromised account” cases using internal tools.

---

## Phase 9 – Advanced Features: MFA, Step-Up Auth, Enterprise SSO

**Objective**

Add higher-assurance features on top of the stable core.

**Includes**

- MFA at IdP layer:
  - TOTP, WebAuthn/passkeys, SMS/email (if needed).
  - Record:
    - `session.mfaLevel`
    - `AuthContext.mfaLevel`.

- Step-up / re-auth flows:
  - For sensitive actions (e.g. linking bank accounts, changing password, managing members):
    - Require recent strong authentication.
  - Implementation options:
    - Short-lived access token with higher `mfaLevel` or `recentlyAuthenticatedAt`.
    - Session flag with timestamp for recent auth.
  - Service-level checks:
    - Verify `mfaLevel` and `recentlyAuthenticatedAt` against thresholds.

- Enterprise SSO / SAML / OIDC:
  - Additional `IdentityProvider` implementations:
    - `provider = 'saml:<id>'`, `provider = 'auth0:<connection>'`, etc.
  - Back-channel logout handling:
    - Translate IdP logout messages into:
      - Session and token revocation for affected users.

**Out of scope**

- Initial GA launch (this is future-hardened work).
- Anything that requires contractual/compliance agreements not yet in place.

**Exit criteria**

- High-risk actions can enforce stronger auth guarantees.
- Enterprise customers can integrate SSO without altering core auth semantics.

---

## Suggested Implementation Order

1. Phase 1 – Data model & skeleton.
2. Phase 2 – Access tokens and basic sessions.
3. Phase 3 – Refresh tokens and lifecycle.
4. Phase 4 – Scopes, roles, multi-tenancy.
5. Phase 5 – PATs and tokens API.
6. Phase 6 – Native OAuth/PKCE + IdP abstraction.
7. Phase 7 – Security hardening.
8. Phase 8 – UX & operational tooling.
9. Phase 9 – Advanced MFA/SSO features.

This ordering front-loads core correctness and minimizes future rewrites while keeping UX and advanced features layered on top.

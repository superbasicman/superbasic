# Auth Architecture Plan (`end-auth-goal.md`)

Goal: Define the end-state authentication & authorization architecture for SuperBasic Finance that:
- Works cleanly for web, Capacitor, and fully native mobile.
- Is IdP-agnostic (Auth.js today, Auth0/other tomorrow).
- Minimizes future refactors by centralizing auth into a single, well-defined core.
- Meets modern security expectations (short-lived access, refresh rotation with reuse detection, scoped tokens, multi-tenant safety).
- Provides a fully functional OAuth 2.1-style authorization server from day 1.
- Provides basic OpenID Connect (OIDC) compatibility (code flow + id_token + userinfo) for first- and third-party clients.

This document describes the target polished design, not how to migrate from the current implementation.

------------------------------------------------------------
1. High-Level Design
------------------------------------------------------------

1.1 Core idea

Split auth into two conceptual layers:

1) Identity Provider (IdP) – proves who the user is.

   Could be:
   - Auth.js + own DB (credentials, Google, magic link, etc.)
   - Auth0 / another hosted provider
   - Future: enterprise SSO (SAML/OIDC)

   Output: a Verified Identity (userId, email, etc.) after login.

2) First-Party Auth Core – manages how clients access the API.

   - Lives in `packages/auth-core` (or similar).
   - Issues & validates:
     - Short-lived access tokens (JWT).
     - Long-lived refresh tokens (opaque, hashed).
     - Long-lived Personal Access Tokens (PATs) (opaque, hashed, scoped).
     - OpenID Connect id_tokens for clients that request OIDC.
   - Provides a uniform AuthContext to the rest of the system.

Everything in `apps/api` and `packages/core` should talk to the Auth Core, not the IdP directly.

------------------------------------------------------------
2. Domain Model & Concepts
------------------------------------------------------------

2.1 Entities

In this document, `userId` always refers to the internal domain user (`profiles.id`), not the IdP’s own `users.id` or Auth.js adapter tables. External IdP accounts are linked to this internal `User` via `UserIdentity`.

Core domain types (independent of Auth.js/Auth0):

User
- id
- email
- status (`active`, `disabled`, `locked`, etc.)
- Profile attributes (name, avatar, etc.)

Semantics:
- If `status = 'disabled'` or `status = 'locked'`:
  - All sessions and refresh tokens for that user are invalid and must be revoked.
  - All PATs for that user are invalid.
  - Auth-core must check `User.status` on every authenticated request (JWT or PAT) and reject if not `active`.

UserIdentity (for IdP-agnostic account linking)
- id
- userId
- provider (string; see below)
- providerUserId
- Provider-specific metadata (emailVerified, tenant IDs, etc.)

Guidelines for `provider`:
- Use stable identifiers that survive IdP configuration changes, e.g.:
  - `authjs:credentials`, `authjs:google`
  - `auth0:default`
  - `google` if directly integrated with Google OIDC
  - `saml:<id>` for specific SAML connections
- Avoid ambiguous overlap where `google` sometimes means “via Auth.js” and sometimes “direct”.

ClientType (shared between sessions and request context)
- `web | mobile | cli | partner | other`

Session
- Represents a login on a specific device/browser.
- id
- userId
- type: ClientType
- userAgent
- ipAddress
- deviceName (optional)
- createdAt
- lastUsedAt (updated on meaningful access, throttled)
- expiresAt (inactivity timeout)
- absoluteExpiresAt (hard max lifetime from creation, e.g. 180 days)
- revokedAt (null if active)
- mfaLevel (optional; `none | mfa | phishing_resistant`)
- kind (optional; `default | persistent | short` to model “remember me” vs short sessions)

Semantics:
- `kind` allows UX differences:
  - `short`: shorter inactivity window (e.g. shared computers).
  - `persistent`: longer inactivity window but still capped by absoluteExpiresAt.
- When `User.status` transitions to `disabled`/`locked`, all active sessions for that user must be revoked.

Token (for refresh tokens + PATs; not access tokens)
- id
- userId
- sessionId (nullable; null for PATs or some OAuth tokens)
- type: `refresh | personal_access`
- tokenHash (SHA-256, optionally with global pepper)
- scopes: string[]
- name (for PATs – “Mobile App”, “CI/CD Pipeline”)
- createdAt
- lastUsedAt
- expiresAt
- revokedAt
- familyId (for refresh tokens: all rotated tokens from one login)
- metadata (JSON; optional, e.g. IP allowlist, notes)
- workspaceId (nullable; for PATs, optional workspace scoping; see below)

Invariant for refresh tokens:
- At most one active (`revokedAt IS NULL`) token per `familyId`.
- Enforced with a partial unique index on `(familyId)` where `type = 'refresh' AND revokedAt IS NULL` plus transactional rotation logic.

Workspace / Membership / Role (multi-tenant)
Workspace
- id
- name
- status

WorkspaceMembership
- workspaceId
- userId
- role: `owner | admin | member | viewer` (extensible)

Roles map into permission scopes.

Permission Scope
- String identifiers such as:
  - `read:transactions`, `write:transactions`
  - `read:budgets`, `write:budgets`
  - `read:accounts`, `write:accounts`
  - `read:profile`, `write:profile`
  - Future: `read:workspaces`, `write:workspaces`, `manage:members`, `admin`
- Some scopes are workspace-scoped (e.g. `read:transactions`), some global (e.g. `read:profile`).
- Canonical internal scope syntax:
  - `<action>:<resource>` (e.g. `read:transactions`)
  - Optionally `<action>:<resource>:<qualifier>` (e.g. `manage:members:invites`) if needed later.
  - Scopes are opaque strings to clients; only auth-core interprets them.

OAuthClient (for `/v1/oauth/*` and OIDC flows)
- id / clientId
- type: `public | confidential`
- name
- redirectUris: string[]
- allowedGrantTypes: array of `authorization_code | refresh_token | client_credentials`
- allowedScopes: string[] (upper bound on scopes this client can ever receive; includes OIDC scopes like `openid`, `profile`, `email` when applicable)
- createdAt
- disabledAt (nullable)

2.2 AuthContext

The only thing downstream services should see is an AuthContext, provided by auth middleware:

type ClientType = 'web' | 'mobile' | 'cli' | 'partner' | 'other';

type AuthContext = {
  userId: string;
  sessionId: string | null; // null for PATs or pure client_credentials flows
  scopes: string[];         // effective scopes for the active workspace, plus any global scopes
  activeWorkspaceId: string | null;
  roles: string[];          // roles for activeWorkspaceId
  requestId?: string;
  clientType: ClientType;
  mfaLevel?: 'none' | 'mfa' | 'phishing_resistant';
};

Key semantics:
- `scopes` in AuthContext are the effective scopes for `activeWorkspaceId` plus any global scopes.
- `roles` refer strictly to `activeWorkspaceId`.
- AuthContext.scopes is always derived server-side from:
  - Workspace membership/roles
  - PAT restrictions
  - OAuth client restrictions and granted OAuth/OIDC scopes
- We do not trust scopes inside tokens (JWT or otherwise).

For PATs:
- sessionId = null.
- scopes start from PAT record and are intersected with scopes derived from workspace membership.
- If token.workspaceId is set, activeWorkspaceId is forced to that workspace.

For OAuth client credentials flows:
- sessionId = null.
- userId may represent a service principal / client identity.
- scopes are granted based on:
  - requested `scope` parameter,
  - intersected with OAuthClient.allowedScopes,
  - intersected with any additional server policy.

Important:
- Authorization always requires DB/cache lookups; JWT alone is not sufficient.
- If DB/cache required to derive AuthContext is unavailable, auth-core fails closed (treat as unauthorized).

Usage:
- Route handlers in Hono read this from context (e.g. `c.var.auth`).
- Services in `packages/core` receive AuthContext as an argument.
- Nothing outside auth-core needs to parse tokens or know about IdP internals.

2.3 Identity linking & signup rules

When an IdP flow completes, it returns a VerifiedIdentity:

type VerifiedIdentity = {
  provider: string;         // 'authjs:credentials', 'authjs:google', 'auth0:default', 'google', 'apple', 'saml:<id>', etc.
  providerUserId: string;
  email: string | null;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
  tenantId?: string;        // e.g. Auth0 tenant, SAML tenant
  // other claims as needed
};

Auth-core maps this to a User:

1) Existing identity match (preferred)
- Look up UserIdentity by (provider, providerUserId).
- If found → use linked userId.

2) Email-based linking (verified email only)
- If no UserIdentity found and email is present and emailVerified === true:
  - Look for a User with that email.
  - If found:
    - Create UserIdentity row pointing to that userId.
  - If not found:
    - Create new User + default workspace, then UserIdentity.

User existence checks are server-side only; we never expose “does this email exist?” over public APIs.

3) No verified email
- If no verified email (or no email at all):
  - Create new User, default workspace, and UserIdentity.
  - Only allowed in flows where email is not required.

4) Account merges
- No automatic cross-account merge beyond these rules in v1.
- If a user ends up with multiple accounts, merging is manual/operational.
- Suspicious situations (e.g. multiple IdPs claiming the same verified email in conflicting ways) are logged for review.

2.4 Email semantics & sync

- User.email is the canonical primary email.
- User.email is unique among active users (soft constraint).
- On each successful IdP login:
  - If emailVerified === true and VerifiedIdentity.email differs from User.email:
    - If no other active user has that email:
      - Update User.email and log the change.
    - Else:
      - Log as potential cross-account; do not change User.email.

Multiple emails per user can be supported later with a UserEmail table; v1 assumes one primary email.

------------------------------------------------------------
3. Token Strategy
------------------------------------------------------------

Three main token types:

1) Access Tokens – short-lived JWTs (for APIs).
2) Refresh Tokens – long-lived, opaque, hashed, rotation + reuse detection.
3) Personal Access Tokens (PATs) – long-lived, opaque, hashed, for programmatic access.
4) OIDC id_tokens – short-lived JWTs (for clients; not used for API auth directly).

3.1 Access Tokens (JWT)

- Format: JWT, signed with asymmetric keys (prefer EdDSA/Ed25519, else RS256).
  - No HS256 for access tokens.
  - Include kid in header.
  - Keys managed in KMS; public keys via JWKS.
- Lifetime: 10–30 minutes (configurable, short).
- Used as: `Authorization: Bearer <access_token>` for all clients.
- Audience: include `aud` (e.g. `sb_api`) and validate.
- Allow small clock skew (e.g. ±60s).

Example access token claims:

{
  "iss": "https://api.superbasic.finance",
  "aud": "sb_api",
  "sub": "user_123",
  "sid": "sess_abc",
  "wid": "ws_123",
  "exp": 1700000000,
  "iat": 1699990000,
  "token_use": "access",
  "act": "session",   // 'session' | 'oauth_client'
  "jti": "jwt_123"
}

Sub semantics:
- For user-based grants (normal login, auth code with user):
  - `sub` is the internal userId; `act = 'session'`.
- For client_credentials grants (pure app-level access):
  - `sub` is the OAuth clientId or a stable internal client identity; `act = 'oauth_client'`, `sessionId = null`.

Notes:
- We do not include scopes in access JWTs (`scp` or similar).
- Access JWT is an authentication proof for APIs; actual scopes/roles are derived server-side.

Storage:
- Web: in memory or HttpOnly cookie (via BFF).
- Mobile: secure storage (Keychain/Keystore).
- CLI: environment/config (never committed to VCS).

Verification:
- Only accept configured asymmetric algorithm.
- Validate iss, aud, exp, iat, signature, token_use.
- For tokens with sid:
  - Check session exists, not revoked, not expired.
- Always check User.status == 'active' for user-bound tokens.

Logout / revocation semantics:
- Revoking a session or PAT does not retroactively invalidate already-issued access tokens.
- Access tokens remain usable until exp.
- Immediate revocation applies to refresh tokens, PATs, sessions (for new token issuance).
- Sensitive actions can require step-up auth or shorter TTL.

3.2 Refresh Tokens (rotation & reuse detection)

- Format: random 256-bit string (base64url).
- Stored as hash (SHA-256 + optional pepper).
- Lifetime: 30–90 days (configurable), capped by session.absoluteExpiresAt.
- Relationship with sessions:
  - One active refresh token per session at a time.
  - All tokens created for a given session share a familyId.
  - DB invariant: at most one active refresh per familyId.

DB enforcement:
- Partial unique index:

  CREATE UNIQUE INDEX tokens_refresh_family_active_idx
  ON tokens (familyId)
  WHERE type = 'refresh' AND revokedAt IS NULL;

- Refresh operations run in a single transaction:
  - Mark old token revokedAt = now.
  - Insert new token with same familyId.
  - Update session timestamps.
  - Commit.

Usage:
- Client calls `/v1/auth/refresh` with refresh token (body or cookie).
- Server:
  - Hashes token and looks up refresh token row.
  - If not found → `invalid_grant` (401).
  - If found:
    - revokedAt must be null.
    - expiresAt > now.
    - Associated session must exist, not revoked, not expired.
    - User.status must be active.

On success:
- Issue new access token.
- Rotate refresh token (revoking old, creating new).
- Update `session.lastUsedAt` and extend `session.expiresAt` (sliding expiration) capped by `absoluteExpiresAt`.
- Response:

  {
    "accessToken": "<jwt>",
    "refreshToken": "<opaque>",
    "expiresIn": 1800
  }

Reuse detection:
- If token row exists but revokedAt is not null and there is another active token with same familyId:
  - Treat as likely token theft.
  - Revoke all tokens in the family and the session.
  - Log high-severity incident.
  - Return `invalid_grant` (401).

- If token row exists but revokedAt is not null and there is no active token with that familyId:
  - Treat as stale reuse after logout / full family revoke.
  - Log at lower severity.
  - Return `invalid_grant` (401).

We accept occasional false-positive “kill the session” outcomes due to races.

3.3 Personal Access Tokens (PATs)

- Format: `sbf_<43 base64url chars>`.
- Stored as hashed (SHA-256 + optional pepper).
- Lifetime: configurable expiry; may be long-lived with monitoring.
- Scopes are mandatory.

Workspace scoping:
- token.workspaceId nullable:
  - If set: PAT is bound to a single workspace; activeWorkspaceId is forced to that workspace.
  - Auth-core must verify WorkspaceMembership with appropriate role for that workspace.
  - If null: PAT may act across multiple workspaces, but scopes always intersect with actual memberships.

User status:
- If User.status != active, all PATs for that user are considered invalid.

Usage:
- Clients send: `Authorization: Bearer sbf_<token>`.
- Auth-core:
  - Recognizes PAT prefix.
  - Looks up hash with `type = 'personal_access'`.
  - Validates revokedAt null, expiresAt > now, user active.
  - Verifies membership/roles if workspace-scoped.
  - Derives AuthContext:
    - userId from token
    - sessionId = null
    - scopes = PAT scopes ∩ membership-derived scopes
    - activeWorkspaceId from token.workspaceId or from request (if allowed)
    - clientType = `cli` or `partner` depending on metadata

Requests authenticated with PATs:
- Do not rely on session state.
- Target API-style endpoints.
- Can be rate-limited per token.

3.4 Key Management & JWKS

- Asymmetric keys (RS256/EdDSA) in KMS or secure secret store.
- Each key pair has a kid included in JWT header.
- JWKS endpoint:
  - `GET /.well-known/jwks.json`
  - `GET /v1/auth/jwks.json` (alias)
- Same keys can be used to sign access tokens and id_tokens; algorithms are limited to a small set (e.g. RS256, EdDSA).

Rotation strategy:
- Regular rotation (e.g. every 60–90 days).
- New key pair becomes active for signing.
- Old public keys kept in JWKS until tokens expire.
- Emergency rotation:
  - Stop using compromised keys for signing.
  - Decide whether to keep or remove old keys from JWKS.

3.5 OAuth Clients (conceptual)

For `/v1/oauth/*` and OIDC flows:

- Clients are OAuthClient records.
- Each OAuthClient:
  - Has `type` (public vs confidential).
  - Has a list of `redirectUris`.
  - Has `allowedGrantTypes` e.g. `['authorization_code', 'refresh_token']` for mobile, `['client_credentials']` for server-to-server.
  - Has `allowedScopes` (upper bound for scopes it can receive), including OIDC scopes like `openid`, `profile`, `email` where appropriate.

OAuth `scope` parameter → internal scopes:
- When a client calls `/v1/oauth/authorize` with `scope`:
  - Requested scopes are parsed into a set.
  - The effective OAuth/OIDC grant scopes = requestedScopes ∩ OAuthClient.allowedScopes.
- When exchanging code → tokens:
  - Stored grant scopes from auth code are attached to the resulting token’s identity.
- On each request:
  - Effective scopes = (grant scopes) ∩ (workspace- or user-based scopes):
    - For user-based flows (auth code):
      - Also intersect with membership-derived scopes and PAT constraints (if applicable).
    - For pure client_credentials:
      - Usually just intersection with OAuthClient.allowedScopes and any global policy.

Thus:
- OAuth/OIDC `scope` is a request, not a guarantee.
- Final authority is server-side intersection logic.

3.6 OpenID Connect id_tokens

In addition to access tokens:

- For OIDC-aware clients that request `scope` including `openid`:
  - An id_token (JWT) is issued alongside access_token (and optionally refresh_token) from `/v1/oauth/token`.
- id_tokens:
  - Are signed with the same asymmetric keys as access tokens (RS256 or EdDSA).
  - Have shorter lifetimes (e.g. same or shorter TTL as corresponding access token).
  - Are intended for clients to understand user identity and claims, not for direct API authorization.

Typical id_token claims:

{
  "iss": "https://api.superbasic.finance",
  "sub": "user_123",                  // internal userId; stable per user
  "aud": "mobile_app_client_id",      // client_id
  "exp": 1700000000,
  "iat": 1699990000,
  "auth_time": 1699985000,            // time user was authenticated
  "nonce": "nonce-from-authorize",    // when provided in authorize request
  "email": "user@example.com",        // if 'email' or 'profile' scope granted
  "email_verified": true,
  "name": "User Name",                // if 'profile' scope granted
  "picture": "https://..."            // if 'profile' scope granted
}

Rules:
- id_token is only issued if `openid` is present in requestedScopes and allowed for that client.
- Additional claims (email, name, picture) are only included if corresponding OIDC scopes are granted:
  - `profile` → name, picture, etc.
  - `email` → email, email_verified.
- id_tokens are validated by clients using the JWKS and standard OIDC rules (iss, aud, exp, nonce).

The API layer still does not accept id_tokens as API Bearer tokens; only access tokens are valid for API requests.

------------------------------------------------------------
4. Supported Client Types & Flows
------------------------------------------------------------

4.1 Web SPA (browser-based)

Login:
- User authenticates via IdP (Auth.js/Auth0/etc.).
- IdP adapter returns VerifiedIdentity.
- Auth-core resolves or creates User via linking rules.

Session & token issuance:
- Create Session (type = `web`).
  - Set absoluteExpiresAt (e.g. 180 days from creation).
  - Set expiresAt to inactivity timeout (e.g. 30 days) capped by absoluteExpiresAt.
  - Set kind (`persistent` vs `short`).
- Issue:
  - Access token (JWT).
  - Refresh token (opaque, with familyId).

Storage:
- Access token: in memory or via BFF in a Secure, HttpOnly cookie.
- Refresh token: `sbf_rt` cookie:
  - HttpOnly
  - Secure
  - SameSite=Lax
  - Domain: `.superbasic.finance`
  - Path: `/`

API calls:
- SPA sends `Authorization: Bearer <access_token>`.
- On 401 due to expiry, SPA calls `/v1/auth/refresh`:
  - Refresh token from cookie.
  - CSRF protection via header/cookie (see Security).

Logout:
- SPA calls `/v1/auth/logout`.
- Server revokes session and refresh tokens.
- SPA clears cookies/local state.
- Existing access tokens expire naturally.

4.2 Capacitor Hybrid Apps

- Use embedded webview or in-app browser to drive standard web login.
- After login, exchange IdP session/cookie or code via `/v1/auth/token`.
- Auth-core:
  - Creates Session (type `mobile` or `web`).
  - Issues access + refresh tokens.
- App stores tokens in secure storage.
- API calls use `Authorization: Bearer <access_token>`.

4.3 Fully Native iOS/Android Apps

Use OAuth 2.1 + OIDC Authorization Code + PKCE.

High-level flow:
1) Native app opens system browser to:

   `/v1/oauth/authorize?response_type=code&client_id=mobile&redirect_uri=superbasic://callback&scope=openid profile email&state=...&code_challenge=...&code_challenge_method=S256&nonce=...`

2) User logs in via IdP.
3) Server redirects to:

   `superbasic://callback?code=AUTH_CODE&state=...`

4) Native app calls `/v1/oauth/token` with:
   - grant_type = `authorization_code`
   - code
   - redirect_uri
   - client_id
   - code_verifier

5) Auth-core:
   - Validates code, client, redirect_uri, PKCE, expiry.
   - Creates Session (type = `mobile`) for user-bound flows.
   - Issues:
     - access_token (for APIs),
     - refresh_token,
     - id_token (if `openid` in granted scopes).

6) Native app:
   - Validates id_token locally (iss, aud, exp, nonce).
   - Stores access/refresh tokens in secure storage; uses Bearer access tokens for API.

Refresh:
- `/v1/auth/refresh` with refresh token.
- Optionally, a new id_token can be issued on refresh if desired (or only when specifically requested via scope).

4.4 CLI, Automation, 3rd-Party Integrations (PATs)

- Users manage PATs via:
  - UI, or
  - `/v1/tokens` endpoints.
- PAT is shown once, never retrievable.
- Client uses `Authorization: Bearer sbf_<token>`.

Auth-core:
- Validates PAT, user status, scopes, workspace membership.
- Builds AuthContext with clientType `cli` or `partner`.

4.5 Partners and OAuth/OIDC (User-based + app-based)

- Partners use:
  - Authorization Code + PKCE (and optionally OIDC) for delegated user access (`act = 'oauth_client'`, user-bound).
  - Client Credentials for server-to-server use (no user, “service principal” identity).

Scopes:
- Partner requests `scope` in authorize/token calls (e.g. `openid profile read:transactions`).
- Effective scopes:
  - requestedScopes ∩ OAuthClient.allowedScopes,
  - further intersected with user/workspace scopes for user-based grants.

Client Credentials:
- `grant_type=client_credentials` at `/v1/oauth/token`.
- Access token subject represents client identity.
- AuthContext may have `sessionId = null` and `clientType = 'partner'`.
- OIDC-related scopes (`openid`, `profile`, `email`) are typically not used in client_credentials, but server policy can define behavior if needed.

------------------------------------------------------------
5. API Surface (Auth + OAuth/OIDC Endpoints)
------------------------------------------------------------

All paths assume `/v1` prefix.

5.1 Core Auth Endpoints

GET `/v1/auth/session`
- Returns current session info derived from an access token:
  - user (id, email, name)
  - session metadata
  - activeWorkspaceId
  - scopes
  - roles
  - mfaLevel

POST `/v1/auth/token`
- Exchanges:
  - Authorization code (first-party or OAuth/OIDC), or
  - Short-lived IdP login proof (for web/Capacitor BFF),
  for access + refresh tokens (and id_token for internal OIDC-like flows if desired).

Body shape depends on flow.

Response (example for code exchange):
- accessToken
- refreshToken
- expiresIn
- idToken (optional, for OIDC-aware flows)

POST `/v1/auth/refresh`
- Body for non-cookie flows:
  - `{ "refreshToken": "<opaque>" }`
- Or refresh token via cookie `sbf_rt` plus CSRF protections.
- Response:

  {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresIn": 1800,
    "idToken": "..." // optional; may be omitted unless OIDC-only clients request it explicitly
  }

POST `/v1/auth/logout`
- Revokes:
  - Current session.
  - All associated refresh tokens in that session’s familyId.
- Clears auth cookies (if present).

GET `/v1/auth/sessions`
- Lists active sessions for current user (for “manage devices” UI).

DELETE `/v1/auth/sessions/:id`
- Revokes an individual session (remote logout).
- Also revokes associated active refresh tokens.

GET `/v1/auth/jwks.json`
GET `/.well-known/jwks.json`
- Returns JWKS for verifying JWTs (access tokens and id_tokens).

5.2 OAuth/OIDC Authorization Endpoint

GET `/v1/oauth/authorize`
- Standard OAuth 2.1 + OIDC authorization endpoint.
- Required query params:
  - response_type=code
  - client_id
  - redirect_uri
  - scope (space-delimited; may include `openid profile email` for OIDC)
  - state
  - code_challenge
  - code_challenge_method
  - nonce (required for OIDC requests with `openid`)
- Behavior:
  - Validates client_id and redirect_uri against OAuthClient.
  - Validates requested scopes against OAuthClient.allowedScopes.
  - Delegates identity verification to IdP.
  - On success:
    - Determines grantedScopes = requestedScopes ∩ OAuthClient.allowedScopes.
    - Stores authorization code record with:
      - userId
      - clientId
      - redirectUri
      - codeChallenge
      - grantScopes
      - nonce (for OIDC)
      - authTime (for OIDC auth_time claim)
      - expiry (e.g. 5–10 minutes).
  - Redirects to redirect_uri with:
    - `code=AUTH_CODE`
    - `state=...`

5.3 OAuth/OIDC Token Endpoint

POST `/v1/oauth/token`
- Handles:
  - `grant_type=authorization_code`:
    - Validates code, client_id, redirect_uri, PKCE (code_verifier).
    - Deletes code (single-use).
    - Creates a Session (for user-based flows) if appropriate.
    - Issues:
      - access_token (for APIs),
      - refresh_token (if allowed for client),
      - id_token (if `openid` in grantScopes).
    - Base grant scopes come from `grantScopes` stored with code.
  - `grant_type=refresh_token`:
    - Delegated to core refresh logic.
    - May optionally include a fresh id_token in response if OIDC clients rely on it.
  - `grant_type=client_credentials` (confidential clients only):
    - Validates client authentication (client_id + client_secret or mutual TLS).
    - Validates requested scope subset of OAuthClient.allowedScopes.
    - Issues access token without user-bound session; `act = 'oauth_client'`, `sessionId = null`.
    - Scopes in AuthContext derived from grantScopes ∩ policy, not from membership.

Example successful response for user-based OIDC flow:

{
  "access_token": "<jwt>",
  "refresh_token": "<opaque>",
  "id_token": "<jwt>",
  "token_type": "Bearer",
  "expires_in": 1800,
  "scope": "openid profile email read:transactions"
}

5.4 PAT Management Endpoints

POST `/v1/tokens`
- Create PAT with:
  - name
  - scopes
  - optional workspaceId
  - optional expiry
- Returns:
  - token plaintext once,
  - metadata.

GET `/v1/tokens`
- List current user’s PATs with metadata:
  - id, name, scopes, createdAt, lastUsedAt, expiresAt, masked token, workspace binding.

PATCH `/v1/tokens/:id`
- Rename a PAT.

DELETE `/v1/tokens/:id`
- Revoke PAT (revokedAt = now).

5.5 OAuth Introspection, Revocation, Discovery, UserInfo

POST `/v1/oauth/introspect`
- For server-to-server token introspection (inspired by RFC 7662).
- Input:
  - token (access or refresh)
  - token_type_hint (optional; `access_token` or `refresh_token`)
- Authenticates calling client (confidential).
- Returns JSON like:

  {
    "active": true,
    "token_type": "access_token",
    "client_id": "partner_app",
    "sub": "user_123",
    "scope": "read:transactions write:transactions",
    "exp": 1700000000,
    "iat": 1699990000,
    "nbf": 1699980000,
    "aud": "sb_api",
    "iss": "https://api.superbasic.finance"
  }

- For inactive/invalid tokens, returns:

  {
    "active": false
  }

- Never returns raw secrets; only metadata.

POST `/v1/oauth/revoke`
- For standard token revocation (inspired by RFC 7009).
- Input:
  - token (refresh token or PAT)
  - token_type_hint (optional; `refresh_token` or `access_token` for PATs)
- Authenticates client / user.
- On refresh token:
  - Look up refresh token; revoke it and possibly entire family depending on policy.
- On PAT:
  - Revoke corresponding token row.
- Always returns 200 for valid-format requests, regardless of whether token existed, to avoid token enumeration.

GET `/v1/oidc/userinfo`
- OIDC UserInfo endpoint for clients that obtained tokens with `openid` and possibly `profile`/`email` scopes.
- Authenticated via:
  - `Authorization: Bearer <access_token>` (user-bound access token).
- Behavior:
  - Validates access token and session/user status.
  - Returns user claims consistent with granted OIDC scopes:
    - For `openid` only:
      - `{ "sub": "user_123" }`
    - With `profile`:
      - Adds `name`, `picture`, etc.
    - With `email`:
      - Adds `email`, `email_verified`.

Example response:

{
  "sub": "user_123",
  "name": "User Name",
  "email": "user@example.com",
  "email_verified": true,
  "picture": "https://..."
}

GET `/.well-known/openid-configuration`
- Discovery endpoint for OAuth/OIDC-style auto-configuration.
- Returns JSON like:

{
  "issuer": "https://api.superbasic.finance",
  "authorization_endpoint": "https://api.superbasic.finance/v1/oauth/authorize",
  "token_endpoint": "https://api.superbasic.finance/v1/oauth/token",
  "jwks_uri": "https://api.superbasic.finance/.well-known/jwks.json",
  "introspection_endpoint": "https://api.superbasic.finance/v1/oauth/introspect",
  "revocation_endpoint": "https://api.superbasic.finance/v1/oauth/revoke",
  "userinfo_endpoint": "https://api.superbasic.finance/v1/oidc/userinfo",
  "scopes_supported": [
    "openid",
    "profile",
    "email",
    "read:transactions",
    "write:transactions",
    "read:accounts",
    "write:accounts",
    "read:profile",
    "write:profile",
    "read:workspaces",
    "write:workspaces",
    "manage:members",
    "admin"
  ],
  "response_types_supported": ["code"],
  "grant_types_supported": [
    "authorization_code",
    "refresh_token",
    "client_credentials"
  ],
  "code_challenge_methods_supported": ["S256"],
  "id_token_signing_alg_values_supported": ["RS256", "EdDSA"],
  "token_endpoint_auth_methods_supported": [
    "client_secret_basic",
    "client_secret_post"
  ],
  "claims_supported": [
    "sub",
    "iss",
    "aud",
    "exp",
    "iat",
    "auth_time",
    "nonce",
    "email",
    "email_verified",
    "name",
    "picture"
  ]
}

------------------------------------------------------------
6. Authorization Model
------------------------------------------------------------

6.1 Scopes

Core scopes:
- Workspace-scoped:
  - `read:transactions`, `write:transactions`
  - `read:budgets`, `write:budgets`
  - `read:accounts`, `write:accounts`
- Global:
  - `read:profile`, `write:profile`
- Admin / management:
  - `read:workspaces`, `write:workspaces`
  - `manage:members`
  - `admin`
- OIDC scopes (primarily for clients, not internal auth):
  - `openid`
  - `profile`
  - `email`

Scope syntax:
- Scopes are opaque strings externally, but internally follow:
  - `<action>:<resource>` or `<action>:<resource>:<qualifier>`
  - Example: `read:transactions`, `manage:members:invites`.
- OIDC scopes (`openid`, `profile`, `email`) are special-cased:
  - Control which identity claims may appear in id_token and userinfo responses.

AuthContext.scopes consists of:
- All workspace scopes effective for activeWorkspaceId (from roles, PATs, OAuth grants).
- Any global scopes effective for the user/client.
- Note: OIDC-specific scopes are mostly relevant to id_token/userinfo, not application-level authorization.

Scopes are never taken from the access token itself; they’re recomputed on each request.

6.2 Roles & Workspaces (RBAC on top of scopes)

Workspace roles map to scopes, e.g.:

- owner:
  - Everything, including `admin`, `manage:members`, etc.
- admin:
  - Manage members, budgets, accounts, etc., but maybe not delete workspace.
- member:
  - Standard read/write on workspace data, no management.
- viewer:
  - Read-only.

Mapping is centralized in auth-core. Helpers:

- `AuthzService.requireScope(auth, 'write:transactions')`
- `AuthzService.requireRole(auth, 'owner', { workspaceId })`

6.3 Multi-Tenancy

- Access tokens may contain `wid` as a hint only.
- Clients specify workspace via:
  - Path param (e.g. `/v1/workspaces/:workspaceId/transactions`)
  - Or header `X-Workspace-Id`
  - Or default/last-used workspace.

Precedence to determine activeWorkspaceId:
1) If route defines a `:workspaceId` param → that wins.
2) Else, if `X-Workspace-Id` is present → use that.
3) Else, use user’s default workspace.

Then:
- Verify WorkspaceMembership(userId, workspaceId).
- Derive roles and workspace-scoped scopes.
- If hints (from JWT, headers) conflict with path workspaceId, path param wins.

Repository & DB-level safety:
- Repos never see tokens/cookies.
- Workspace-scoped data access always takes workspaceId parameter.
- Queries must be filtered by workspaceId where applicable.
- When acquiring DB connection, API layer sets Postgres GUCs:
  - `app.user_id`
  - `app.workspace_id`
  - `app.mfa_level`
- RLS policies enforce tenant boundaries and invariants.

6.4 Service-Level Rules

- Services accept AuthContext plus domain inputs.
- Enforce business constraints (e.g. “only owner can delete workspace”).

Helper:
- `AuthzService.requireWorkspaceRole(auth, 'owner')`

6.5 Route Workspace Semantics

Each route has `workspaceMode` annotation:

- `required`: activeWorkspaceId must be non-null (e.g. `/v1/workspaces/:workspaceId/transactions`).
- `optional`: may be null; still computed if present (e.g. `/v1/workspaces` listing).
- `forbidden`: activeWorkspaceId must be null (e.g. `/v1/me`).

Auth middleware uses route metadata + AuthContext to enforce this.

------------------------------------------------------------
7. Integration with Hono 3-Layer Architecture
------------------------------------------------------------

7.1 Middleware

Auth middleware in `apps/api`:

1) Extract credentials:
   - `Authorization: Bearer <token>` (JWT or PAT).
   - Cookies (refresh token) for `/auth/*` endpoints.

2) Call `AuthService.verifyRequest` with:
   - authorizationHeader
   - cookies
   - ipAddress
   - userAgent
   - url
   - headers
   - routeWorkspaceMode
   - routeWorkspaceParam (e.g. `"workspaceId"` or null)

3) `AuthService.verifyRequest`:
   - Distinguishes JWT vs PAT.
   - Verifies token signature and claims (for JWT).
   - Looks up session, PATs, workspace membership as needed.
   - Checks User.status == active for user-bound flows.
   - Resolves activeWorkspaceId and roles via membership, respecting route workspace mode and precedence.
   - Derives clientType from issuing context:
     - SPA login → `web`
     - Mobile OAuthClient `mobile` → `mobile`
     - PAT created by user → `cli`
     - OAuth clients for partners → `partner`

4) Attaches AuthContext to request context (e.g. `c.var.auth`).

5) For public endpoints, AuthContext may be null (explicitly allowed).

6) When DB client is acquired:
   - Set GUCs from AuthContext.
   - RLS policies ensure tenant isolation.

7.2 Route Handlers

- Never parse tokens or run auth logic directly.
- Assume AuthContext is present/validated when required.

Example:

  transactionsRoute.get('/', async (c) => {
    const auth = c.var.auth;
    if (!auth) throw new UnauthorizedError();

    AuthzService.requireScope(auth, 'read:transactions');

    const query = listTransactionsSchema.parse({
      ...c.req.query(),
    });

    const result = await TransactionsService.list({
      auth,
      ...query,
    });

    return c.json(result);
  });

7.3 Services & Repositories

- Services:
  - Accept AuthContext and domain inputs.
  - Enforce business-level access rules.

- Repositories:
  - Accept primitives like userId and workspaceId.
  - Do not know about tokens/IdP.
  - Rely on explicit filters + RLS.

------------------------------------------------------------
8. Security Controls
------------------------------------------------------------

8.1 Cookies, CORS, CSRF

Web/Capacitor cookies:

`sbf_rt` (refresh token)
- HttpOnly: true
- Secure: true (production)
- SameSite: Lax
- Domain: `.superbasic.finance`
- Path: `/`

Optional `sbf_csrf` cookie:
- Non-HttpOnly, random value.
- Secure: true
- SameSite: Lax
- Used for double-submit CSRF protection.

CORS:
- API: `https://api.superbasic.finance`
- SPA: `https://app.superbasic.finance`
- CORS:
  - Access-Control-Allow-Origin: `https://app.superbasic.finance`
  - Access-Control-Allow-Credentials: true
  - Access-Control-Allow-Headers includes `Authorization`, `Content-Type`, `X-CSRF-Token`, `X-Requested-With`, etc.
- Frontend uses `credentials: 'include'` when cookies are needed.

CSRF:
- Any endpoint using cookies for auth (e.g. refresh, logout) must require:
  - Either `X-CSRF-Token` header matching `sbf_csrf` cookie, or
  - `X-Requested-With=XMLHttpRequest` plus Origin/Referer checks.
- Data APIs using `Authorization: Bearer` header are CSRF-safe by design.

No storing access tokens in localStorage or non-HttpOnly cookies.

8.2 Token Storage & Hashing

- Refresh tokens and PATs:
  - Hash with SHA-256 + optional pepper.
  - Plaintext never stored.
  - Store a short prefix separately for masked display (e.g. last 4 chars).

- Access tokens and id_tokens (JWTs):
  - Not stored server-side.
  - May log `jti` or derived identifiers for correlation/blacklist.

8.3 Rate Limiting & Brute Force

Apply per-IP and per-user limits to:
- Login
- Token refresh
- PAT creation
- Sensitive IdP-driven operations (password change, MFA changes)

Account lockout/captcha live at the IdP layer.

8.4 Session Lifetime & Sliding Expiration

Definitions:
- session.createdAt: creation time.
- session.absoluteExpiresAt: hard max lifetime (e.g. 180 days).
- session.lastUsedAt: updated on meaningful requests/refreshes (throttled).
- session.expiresAt: inactivity timeout from lastUsedAt, capped by absoluteExpiresAt.
- session.kind: influences inactivity window (`short` vs `persistent`).

On successful refresh:
- Update lastUsedAt.
- Extend expiresAt = min(absoluteExpiresAt, lastUsedAt + inactivityWindow(kind)).

When now > expiresAt or now > absoluteExpiresAt:
- Session is expired.
- Refresh tokens for that session are unusable regardless of token.expiresAt.

When User.status becomes `disabled` or `locked`:
- All sessions / refresh tokens for that user must be revoked immediately.

8.5 MFA / Additional Factors (Future)

- Implemented in IdP layer (TOTP, WebAuthn, etc.).
- Auth-core stores mfaLevel per session and in AuthContext.

Step-up / re-auth:
- For sensitive actions (bank linking, password change):
  - Require re-auth or stronger factor.
- Implementation:
  - Possibly issue short-lived step-up tokens or mark session as recentlyAuthenticatedAt.
- Checks:
  - mfaLevel >= requested level.
  - recentlyAuthenticatedAt within defined window.

8.6 Auditing & Logging

Log events:
- Login success/failure.
- Token creation/rotation.
- Refresh reuse detection (with severity).
- Session revocation.
- PAT operations.
- Account disable/lock.

Never log full tokens. Log:
- userId, sessionId, tokenId, familyId.
- Anonymized/truncated network info:
  - IP truncated (e.g. IPv4 /24, IPv6 /48) or hashed.
  - User agent normalized (browser family + version + OS family).
- Action type, timestamp, and relevant context.

Update tokens.lastUsedAt and sessions.lastUsedAt on successful use (throttled to avoid hot writes).

8.7 Error Model

Error JSON structure:

{
  "error": "<error_code>",
  "error_description": "<human readable>"
}

Common codes:
- invalid_request (400)
- invalid_grant (401)
- unauthorized (401)
- forbidden (403)
- invalid_client (401/403)

Non-auth endpoints use similar codes for auth-related errors (e.g. 401/403).

8.8 Performance

Per-request work typically:
- Verify JWT.
- Look up Session (for session-based flows).
- Resolve WorkspaceMembership and roles for active workspace.
- For PAT/partner flows, validate PAT or client credentials.

To optimize:
- Membership/role cache keyed by (userId, workspaceId) with short TTL (30–120s).
- Invalidate/refresh on membership changes.
- Cache JWKS internally.

Security requirement:
- Caching only for positive, short-lived results.
- If DB/cache not available, fail closed: treat request as unauthorized.

------------------------------------------------------------
9. Operational & UX Considerations
------------------------------------------------------------

9.1 “Manage Devices” Page

Backed by `/v1/auth/sessions` and `/v1/auth/sessions/:id`:
- Display:
  - Device type, browser (from normalized UA), region (from truncated IP).
  - CreatedAt, lastUsedAt.
  - Session kind.
- Actions:
  - Revoke sessions (log out device).

9.2 “API Tokens” Page

Backed by `/v1/tokens`:
- Display:
  - Name, scopes, createdAt, lastUsedAt, expiry, masked token, workspace binding.
- Actions:
  - Create tokens.
  - Rename.
  - Revoke.

9.3 Incident Response

If compromise suspected:
- Admin/support tools:
  - Revoke user sessions.
  - Revoke specific PATs.
  - Revoke all tokens in a refresh family.
  - Force “log out of all devices” for a user.
- Use audit logs to trace activity by tokenId/familyId/userId.

9.4 Account Deletion

On user deletion or deletion request:
- Revoke all sessions and refresh tokens.
- Revoke all PATs.
- Handle workspaces:
  - If user is sole owner: delete or mark workspace for cleanup per product policy.
  - Else: remove membership, transfer any required ownership.
- Audit logs:
  - Consider anonymization per compliance requirements.

------------------------------------------------------------
10. IdP-Agnostic Design
------------------------------------------------------------

IdentityProvider interface:

interface IdentityProvider {
  authenticateWithCredentials(email: string, password: string): Promise<VerifiedIdentity>;
  initiateOAuth(provider: 'google' | 'apple' | ...): RedirectUrl;
  handleOAuthCallback(query: URLSearchParams): Promise<VerifiedIdentity>;
  sendMagicLink(email: string): Promise<void>;
  verifyMagicLink(token: string): Promise<VerifiedIdentity>;
  // Future: handleSamlResponse, handleOidcLogout, etc.
}

Auth-core consumes only VerifiedIdentity + linking rules.

Separation:
- User is canonical internal account.
- UserIdentity links external IdP accounts to User.
- Switching IdP should not break:
  - Token formats (access, refresh, PAT, id_token).
  - Auth endpoints.
  - AuthContext.
  - PATs/scopes/sessions.

Password resets, verification, MFA:
- Implemented at IdP.
- Auth-core cares about:
  - emailVerified,
  - mfaLevel (if provided),
  - resulting userId.

Back-channel logout / SSO logout:
- IdP can notify app to log out user/session.
- Integration layer:
  - Maps IdP subject/session to userId/sessionId.
  - Revokes sessions and refresh tokens using same primitives as `/v1/auth/logout`.

10.1 Migration: Auth.js → Auth0 (or other)

- Current system:
  - User is canonical.
  - UserIdentity.provider values like `authjs:credentials` or `authjs:google`.

Introducing Auth0:
- New logins from Auth0 produce VerifiedIdentity with:
  - provider = `auth0:<connection>`
  - providerUserId = auth0 user id
  - email, emailVerified, etc.

Linking behavior:
- Existing users:
  - If emailVerified and matching User.email:
    - Create corresponding UserIdentity row.
- New users:
  - Create new User + UserIdentity.

Auth-core, tokens, PATs, scopes, sessions, AuthContext, and OIDC behavior all remain unchanged during migration; only IdentityProvider implementation and UserIdentity rows evolve.

------------------------------------------------------------
11. Summary
------------------------------------------------------------

This design defines a full, production-grade authentication and authorization system for SuperBasic Finance that:

- Centralizes identity and tokens in a first-party auth-core.
- Uses:
  - Short-lived asymmetrically signed JWT access tokens with key rotation.
  - Long-lived, opaque refresh tokens with strict rotation and reuse detection.
  - Scoped, hashed PATs for API/automation.
  - OIDC-compatible id_tokens and a userinfo endpoint for client-side identity.
- Provides a single AuthContext abstraction with clear workspace semantics and server-side scope derivation.
- Implements a fully functional OAuth 2.1 + OIDC server from day 1:
  - `/v1/oauth/authorize`
  - `/v1/oauth/token`
  - `/v1/oauth/introspect`
  - `/v1/oauth/revoke`
  - `/v1/oidc/userinfo`
  - `/.well-known/jwks.json`
  - `/.well-known/openid-configuration`
- Keeps authorization for application data server-side and database-backed, with strong multi-tenant isolation (RLS + explicit filters).
- Is IdP-agnostic and compatible with future MFA and SSO.
- Has built-in support for operational needs:
  - Device management.
  - API token management.
  - Incident response and auditing (with privacy-conscious logging).
- Fails closed on auth/DB failures and uses careful caching for performance without sacrificing security.

This is intended to be a “one-time heavy lift” auth architecture that avoids major rewrites later, while still being flexible enough for new IdPs, flows, and security requirements, and OIDC-compatible for clients that expect modern identity semantics.

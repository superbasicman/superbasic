# Auth Architecture Plan (`end-auth-goal.md`)

> Goal: Define the end-state authentication & authorization architecture for SuperBasic Finance that:
> - Works cleanly for web, Capacitor, and fully native mobile.
> - Is IdP-agnostic (Auth.js today, Auth0/other tomorrow).
> - Minimizes future refactors by centralizing auth into a single, well-defined core.
> - Meets modern security expectations (short-lived access, refresh rotation with reuse detection, scoped tokens, multi-tenant safety).

This document describes the target polished design, not how to migrate from the current implementation.

---

## 1. High-Level Design

### 1.1 Core idea

Split auth into two conceptual layers:

1. **Identity Provider (IdP)** – proves who the user is.

   Could be:
   - Auth.js + own DB (credentials, Google, magic link, etc.)
   - Auth0 / another hosted provider
   - Future: enterprise SSO (SAML/OIDC)

   Output: a **Verified Identity** (`userId`, email, etc.) after login.

2. **First-Party Auth Core** – manages how clients access the API.

   - Lives in `packages/auth-core` (or similar).
   - Issues & validates:
     - Short-lived **access tokens** (JWT).
     - Long-lived **refresh tokens** (opaque, hashed).
     - Long-lived **Personal Access Tokens (PATs)** (opaque, hashed, scoped).
   - Provides a uniform **AuthContext** to the rest of the system.

Everything in `apps/api` and `packages/core` should talk to the **Auth Core**, not the IdP directly.

---

## 2. Domain Model & Concepts

### 2.1 Entities

In this document, `userId` always refers to the **internal domain user** (`profiles.id`), not the IdP’s own `users.id` or Auth.js adapter tables. External IdP accounts are linked to this internal `User` via `UserIdentity`.

Core domain types (independent of Auth.js/Auth0):

- **User**
  - `id`
  - `email`
  - `status` (`active`, `disabled`, `locked`, etc.)
  - Profile attributes (name, avatar, etc.)

  Semantics:

  - If `status = 'disabled'` or `status = 'locked'`:
    - All sessions and refresh tokens for that user are considered invalid and must be revoked.
    - All PATs for that user are considered invalid.
    - Auth-core must check `User.status` on **every** authenticated request (JWT or PAT) and reject if not `'active'`.

- **UserIdentity** (for IdP-agnostic account linking; future-proof)
  - `id`
  - `userId`
  - `provider` (string; see below)
  - `providerUserId`
  - Provider-specific metadata (e.g. `emailVerified`, tenant IDs, etc.)

  Guidelines for `provider`:

  - Use stable identifiers that survive IdP configuration changes, e.g.:
    - `'authjs:credentials'`, `'authjs:google'`, `'authjs:email'`
    - `'auth0:default'`
    - `'google'` if directly integrated with Google OIDC
    - `'saml:<id>'` for specific SAML connections
  - Avoid ambiguous overlap where `'google'` sometimes means “via Auth.js” and sometimes “direct”; include the aggregator in the prefix when appropriate.

- **ClientType** (shared between sessions and request context)
  - `'web' | 'mobile' | 'cli' | 'partner' | 'other'`

- **Session**
  - Represents a login on a specific device/browser.
  - `id`
  - `userId`
  - `type: ClientType`
  - `userAgent`
  - `ipAddress`
  - `deviceName` (optional)
  - `createdAt`
  - `lastUsedAt` (updated on meaningful access, throttled)
  - `expiresAt` (inactivity timeout; next time after which the session is considered expired if not used)
  - `absoluteExpiresAt` (hard max lifetime from creation, e.g. 180 days; `expiresAt` is always capped by this)
  - `revokedAt` (null if active)
  - `mfaLevel` (optional; e.g. `'none' | 'mfa' | 'phishing_resistant'`)
  - `kind` (optional; e.g. `'default' | 'persistent' | 'short'` to model “remember me” vs short sessions)

  Semantics:

  - `kind` allows UX differences:
    - `'short'`: shorter inactivity window (e.g. shared computers).
    - `'persistent'`: longer inactivity window (e.g. “Remember me”) but still capped by `absoluteExpiresAt`.
  - When `User.status` transitions to `'disabled'`/`'locked'`, all active sessions for that user should be revoked.

- **Token**
  - Used for refresh tokens + PATs (not access tokens).
  - `id`
  - `userId`
  - `sessionId` (nullable; null for PATs)
  - `type`: `'refresh' | 'personal_access'`
  - `tokenHash` (SHA-256, optionally with global pepper)
  - `scopes: string[]`
  - `name` (for PATs – “Mobile App”, “CI/CD Pipeline”)
  - `createdAt`
  - `lastUsedAt`
  - `expiresAt`
  - `revokedAt`
  - `familyId` (for refresh tokens: all rotated tokens from one login)
  - `metadata` (JSON; optional, e.g. IP allowlist, notes)
  - `workspaceId` (nullable; for PATs, optional workspace scoping; see below)

  Invariant for refresh tokens: **at most one active (`revokedAt IS NULL`) token per `familyId`**. This can be enforced at the DB level with a partial unique index on `(familyId)` where `revokedAt IS NULL`.

- **Workspace / Membership / Role** (multi-tenant, future-ready)
  - `Workspace`
    - `id`
    - `name`
    - `status`
  - `WorkspaceMembership`
    - `workspaceId`
    - `userId`
    - `role`: `'owner' | 'admin' | 'member' | 'viewer'` (extensible)

  Roles are mapped internally to **permissions** / **scopes**.

- **Permission Scope**
  - String identifiers (already in use) such as:
    - `read:transactions`, `write:transactions`
    - `read:budgets`, `write:budgets`
    - `read:accounts`, `write:accounts`
    - `read:profile`, `write:profile`
    - Future: `read:workspaces`, `write:workspaces`, `manage:members`, `admin`
  - Some scopes are **workspace-scoped** (e.g. `read:transactions`), and some are **global** (e.g. `read:profile`); see Authorization model.

- **OAuthClient** (future, for `/v1/oauth/*` flows)
  - `id` / `clientId`
  - `type`: `'public' | 'confidential'`
  - `name`
  - `redirectUris: string[]`
  - `createdAt`
  - `disabledAt` (nullable)

  For v1, this can be hardcoded to a single first-party `mobile` public client; the entity becomes useful when adding more clients or third parties.

### 2.2 AuthContext

The only thing downstream services should see is an `AuthContext`, provided by auth middleware:

    type ClientType = 'web' | 'mobile' | 'cli' | 'partner' | 'other';

    type AuthContext = {
      userId: string;
      sessionId: string | null; // null for PATs
      scopes: string[];         // effective scopes for the active workspace, plus any global scopes
      // Multi-tenancy
      activeWorkspaceId: string | null;
      // Roles/permissions for that workspace only
      roles: string[];          // ['owner', 'admin', ...]
      // Request-scoped metadata
      requestId?: string;
      clientType: ClientType;
      mfaLevel?: 'none' | 'mfa' | 'phishing_resistant';
    };

Key semantics:

- `scopes` in `AuthContext` are the **effective scopes for `activeWorkspaceId`**, plus any **global** scopes that are not workspace-bound (e.g. `read:profile`).
- `roles` refer strictly to the `activeWorkspaceId`.
- `AuthContext.scopes` is **always derived server-side** from workspace membership and role mapping (plus PAT restrictions); we do **not** trust or even include scopes inside access tokens.
- For PATs:
  - `sessionId = null`.
  - `scopes` start from the PAT record and are intersected with scopes derived from current workspace membership.
  - If `token.workspaceId` is set, `activeWorkspaceId` is forced to that workspace.

Important: because `AuthContext.scopes` and `activeWorkspaceId` are recomputed from DB/cache on every request, the **JWT alone is not sufficient to authorize any operation**. The API layer depends on DB/cache availability for authorization decisions.

Usage:

- Route handlers in Hono read this from context (e.g. `c.var.auth`).
- Services in `packages/core` receive `AuthContext` as an argument (or via DI).
- Nothing outside the auth-core needs to parse tokens or know about IdP internals.

### 2.3 Identity linking & signup rules

When an IdP flow completes, it returns a `VerifiedIdentity`:

    type VerifiedIdentity = {
      provider: string;         // 'authjs:credentials', 'authjs:google', 'authjs:email', 'auth0:default', 'google', 'apple', 'saml:<id>', etc.
      providerUserId: string;
      email: string | null;
      emailVerified?: boolean;
      name?: string;
      picture?: string;
      tenantId?: string;        // e.g. Auth0 tenant, SAML tenant
      // other claims as needed
    };

Auth-core applies deterministic rules to map this to a `User`:

1. **Existing identity match (preferred)**
   - Look up `UserIdentity` by `(provider, providerUserId)`.
   - If found → use the linked `userId`.

2. **Email-based linking (verified email only)**
   - If no `UserIdentity` found and `email` is present and `emailVerified === true`:
     - Look for a `User` with that email.
     - If found:
       - Link this IdP account by creating a `UserIdentity` row pointing to that `userId`.
     - If not found:
       - Create a new `User` + default workspace, then a `UserIdentity`.

3. **No verified email**
   - If no verified email (or no email at all):
     - Create a new `User`, default workspace, and `UserIdentity`.
     - This may be restricted to specific flows where email is not required.

4. **Account merges**
   - For v1, there is **no** automatic cross-account merge beyond the above rules.
   - If a user ends up with multiple accounts, merging is a manual/operational process, or a future feature.

This keeps IdP behavior swappable while keeping user identity stable inside the domain.

### 2.4 Email semantics & sync

- `User.email` is the **canonical primary email** for the user inside SuperBasic Finance.
- In v1, we treat `User.email` as **unique among active users** (soft constraint; enforced in code and/or DB), but do not rely on it as the only identifier (the IdP link is still via `UserIdentity`).
- On each successful IdP login:
  - If `VerifiedIdentity.emailVerified === true` and `VerifiedIdentity.email` differs from `User.email`:
    - If no other active `User` has that email:
      - Update `User.email` to the new verified email and log the change.
    - If another user already owns that email:
      - Treat as a potential cross-account situation; log it for review, and do **not** auto-switch `User.email`.
- Multiple emails per user (e.g. aliases) can be supported later by adding a separate `UserEmail` table; for v1, we assume **one primary email per user**.

---

## 3. Token Strategy

There are three main token types in the end-state:

1. **Access Tokens** – Short-lived JWTs.
2. **Refresh Tokens** – Long-lived, opaque, hashed in DB, with rotation & reuse detection.
3. **Personal Access Tokens (PATs)** – Long-lived, opaque, hashed in DB, for programmatic access.

### 3.1 Access Tokens (JWT)

- **Format:** JWT, signed with asymmetric keys (prefer **EdDSA (Ed25519)** when library support is solid; otherwise **RS256**).
  - **HS256 and other symmetric algorithms are not used** for access tokens to avoid key-sharing risks.
  - Include `kid` in the header.
  - Keys are managed via KMS; public keys are published via JWKS (see Key Management).
  - API only needs public keys.
- **Lifetime:** 10–30 minutes (configurable, short).
- **Where used:** `Authorization: Bearer <access_token>` header for all clients (web, mobile, CLI, partners).
- **Audience:** Include `aud` (e.g. `"sb_api"`) and validate it.
- **Clock skew:** Allow a small skew window when validating `exp`/`iat` (e.g. ±60 seconds), to tolerate small clock differences between services.

**Claims (example):**

    {
      "iss": "https://api.superbasic.finance", // issuer
      "aud": "sb_api",                         // audience
      "sub": "user_123",                       // userId
      "sid": "sess_abc",                       // sessionId (omitted for PAT-derived if no session)
      "wid": "ws_123",                         // active workspace id hint (revalidated server-side)
      "exp": 1700000000,                       // expiry (seconds since epoch)
      "iat": 1699990000,                       // issued at
      "token_use": "access",                   // token purpose (access vs others in future)
      "act": "session",                        // 'session' | 'pat' | 'other'; indicates origin of this access token
      "jti": "jwt_123"                         // token id, for logging/blacklist if needed
    }

Notes:

- The header `typ` remains the standard JWT type; the payload uses `token_use` instead of a second `typ` to avoid confusion.
- `act` distinguishes session-derived access tokens from PAT-derived ones for logging/analysis.
- **We do not embed scopes (`scp`) in the JWT.** All effective scopes are resolved per-request from workspace membership, roles, and (for PATs) token configuration.
- JWTs are **authentication proofs**, not standalone authorization objects. They always require DB/cache lookups to derive `AuthContext`.

- **Storage:**
  - Web: in memory (e.g. React state) or in a Secure, HttpOnly cookie via a Backend For Frontend (BFF) pattern.
  - Mobile: secure storage (Keychain / Keystore).
  - CLI: environment variables / config files (never committed).

- **Verification:**
  - Restrict accepted algorithms to the configured asymmetric algorithm only.
  - Validate `iss`, `aud`, `exp`, `iat` (with skew), signature, and `token_use`.
  - On every request, auth-core **also** checks:
    - `User.status === 'active'`, and
    - Session status when `sid` is present (not revoked, not expired).

**Logout / revocation semantics:**

- Revoking a session or PAT does **not** retroactively invalidate already-issued access tokens.
- We accept that access tokens remain usable until their `exp` (e.g. up to 10–30 minutes after revocation).
- Immediate revocation is enforced for:
  - Refresh tokens,
  - PAT records,
  - Sessions (for refresh and PAT issuance).
- For especially sensitive actions, step-up auth and shorter token TTLs can be used (see 8.5).

### 3.2 Refresh Tokens (with rotation & reuse detection)

- **Format:** Random 256-bit string (e.g. base64url).
- **Stored:** Only as hash in DB (`tokenHash`) plus a global pepper (env/KMS) if desired.
- **Lifetime:**
  - Typical: 30–90 days (configurable).
  - Tied to **session lifetime**; `token.expiresAt` ≤ `session.absoluteExpiresAt`.
- **Session relationship:**
  - 1 active refresh token per session at a time.
  - All refresh tokens created for a session share a `familyId`.
  - Invariant: **at most one active refresh token per `familyId`**; enforced with a partial unique index on `(familyId)` where `revokedAt IS NULL`.

**Usage:**

- Client calls `/v1/auth/refresh` with refresh token (body or HttpOnly cookie).
- Server:
  - Hashes the presented token.
  - Looks up in `tokens` where:
    - `type = 'refresh'`
    - `tokenHash = ...`
  - If not found:
    - Return `invalid_grant` (HTTP 401). This is not considered a compromise on its own; it may be random garbage.
  - If found:
    - Check:
      - `revokedAt IS NULL`
      - `expiresAt > now`
      - Associated `session`:
        - Exists
        - Not revoked (`sessions.revokedAt IS NULL`)
        - Not expired (`now <= session.expiresAt` and `now <= session.absoluteExpiresAt`)
      - `User.status === 'active'`.

- On success:
  - Issues a new access token.
  - **Rotates** the refresh token (mandatory):
    - Marks the old token as `revokedAt = now`.
    - Creates a new refresh token row:
      - Same `familyId`.
      - New `expiresAt` (bounded by `session.absoluteExpiresAt`).
  - Updates `session.lastUsedAt` and potentially `session.expiresAt` (sliding expiration; see 8.4).
  - Returns:

        {
          "accessToken": "<jwt>",
          "refreshToken": "<opaque>",
          "expiresIn": 1800
        }

**Reuse detection:**

- If a refresh token is presented that:
  - Exists in DB but `revokedAt IS NOT NULL`, and
  - There is **another active token** with the same `familyId`:
    - Treat this as likely token theft.
    - Revoke:
      - All tokens in that `familyId` (defensive “kill the whole family”).
      - The underlying `session` (defensive “kill the whole session”).
    - Log a high-severity incident event for security review.
    - Return an `invalid_grant` error with HTTP 401.

- If a refresh token is presented that:
  - Exists in DB but `revokedAt IS NOT NULL`, and
  - There is **no active token** with the same `familyId`:
    - This likely means:
      - The token was already rotated and then the entire session was revoked/logged out, or
      - The user is trying to reuse a stale token after logout.
    - Behavior:
      - Return `invalid_grant` (HTTP 401).
      - Log at lower severity (not automatically treated as “theft” unless there are additional signals).

- We explicitly accept **occasional false-positive “kill the whole session” outcomes** due to refresh races (e.g. flaky networks, double-submits). UX impact: the user might have to log in again, which is acceptable for v1 in exchange for simpler semantics.

**Race handling:**

- Two concurrent refreshes for the same token:
  - First succeeds, second sees the token as revoked.
  - The second will either:
    - Trigger reuse detection (and kill the family) if a new active token exists in that family, or
    - Be treated as a non-incident `invalid_grant` if the session has already been fully revoked.
- For v1, **any** reuse after rotation with another active token present is treated as a true reuse incident; there is **no grace window**.

### 3.3 Personal Access Tokens (PATs)

- **Format:** `sbf_<43 base64url chars>` (current design).
- **Stored:** Hash (SHA-256 + optional pepper).
- **Lifetime:** Configurable expiry, or long-lived with strong monitoring and revocation UX.
- **Scopes:** Mandatory – PATs are always scoped.

**Workspace scoping & membership checks:**

- `token.workspaceId` (nullable):
  - If set: PAT is **bound to a single workspace**; `AuthContext.activeWorkspaceId` is forced to that workspace.
  - Auth-core **must always verify** that a corresponding `WorkspaceMembership(userId, token.workspaceId)` exists and has a role that implies the requested scopes. If membership or role no longer exists, the PAT is effectively invalid for that workspace.
  - If `token.workspaceId` is null: PAT may be allowed to operate across multiple workspaces, but scopes are still intersected with actual memberships per workspace.
- Additionally, if `User.status != 'active'`, **all PATs for that user are treated as invalid**, regardless of `Token.revokedAt`.

**Usage:**

- `Authorization: Bearer sbf_<token>`
- Auth-core:
  - Recognizes PAT format by prefix.
  - Looks up hash in `tokens` where `type = 'personal_access'`.
  - Validates:
    - `revokedAt IS NULL`
    - `expiresAt > now`
    - User is active (`User.status = 'active'`).
    - Required `WorkspaceMembership` exists (if applicable) and role implies requested scopes.
  - Derives `AuthContext`:
    - `userId` from token
    - `sessionId = null`
    - `scopes` from PAT intersected with scopes derived from membership/roles
    - `activeWorkspaceId` from `token.workspaceId` or from request (if allowed)
    - `clientType = 'cli' | 'partner'` depending on token metadata / creation context (not user-agent)
  - Access tokens minted from PATs will set `act = 'pat'` in the JWT payload.

**Behavior:**

- PAT-authenticated requests:
  - Do not rely on session state.
  - Are ideally restricted to API-style endpoints (no UI-only endpoints).
  - Can be rate-limited per token.

### 3.4 Key Management & JWKS

Access tokens use asymmetric keys (RS256/EdDSA):

- **Key storage:** Signing keys are stored in KMS or a secure secret store, never in code.
- **Key identifiers:** Each key pair has a `kid` that appears in the JWT header.
- **JWKS endpoint:**
  - Public keys are exposed at:
    - `GET /.well-known/jwks.json`
    - Optionally aliased at `GET /v1/auth/jwks.json`
  - Keys in JWKS are read-only to clients and used for verification only.

**Rotation strategy:**

- On rotation:
  - Generate a new key pair.
  - Mark it as the active signing key.
  - Add the new public key (with `kid`) to JWKS.
  - Keep old keys published until all tokens signed with them are naturally expired.
- Rotate on a regular cadence (e.g. every 60–90 days) and as-needed for incidents.
- Emergency rotation:
  - Immediately mark compromised keys as inactive for signing.
  - Keep them in JWKS only for as long as needed to validate older tokens, or revoke them entirely if you accept breaking those sessions.

### 3.5 OAuth Clients (conceptual)

For flows using `/v1/oauth/authorize` and `/v1/oauth/token`:

- Clients are represented by `OAuthClient` (see Entities).
- For v1:
  - A single first-party public client (e.g. `client_id = 'mobile'`) may be hardcoded.
  - Its allowed `redirectUri` is validated against a fixed list.
- When third-party apps are introduced:
  - `OAuthClient` records are persisted with client metadata, redirect URIs, and security properties (public vs confidential).

---

## 4. Supported Client Types & Flows

### 4.1 Web SPA (browser-based)

**Login:**

- User authenticates through IdP:
  - Email/password, OAuth (Google, etc.), magic link.
- IdP adapter returns `VerifiedIdentity` to auth-core (see 2.3).
- Auth-core resolves or creates a `User` via the identity linking rules.

**Session & token issuance:**

- Auth-core creates a `Session` row (`type = 'web'`).
  - `absoluteExpiresAt` set to the max lifetime (e.g. 180 days from creation).
  - `expiresAt` set to an initial inactivity timeout (e.g. 30 days from `createdAt`), capped by `absoluteExpiresAt`.
  - `kind` reflects UX, e.g. `'persistent'` if “Remember me” was checked, `'short'` otherwise.
- Auth-core issues:
  - Access token (JWT, short-lived).
  - Refresh token (opaque, tied to session, with `familyId`).

- Web client stores:
  - Access token in memory (or Secure, HttpOnly cookie managed via BFF).
  - Refresh token, preferably as an HttpOnly cookie for browser flows (`sbf_rt`), same-origin or carefully configured cross-subdomain (see 8.1).

**API calls:**

- SPA adds `Authorization: Bearer <access_token>` to API requests.
- When access token expires:
  - SPA calls `/v1/auth/refresh` (with refresh token cookie or body).
  - Gets new access + refresh pair.
- On logout:
  - Calls `/v1/auth/logout` to revoke session and refresh tokens.
  - Clears cookies.
  - Access tokens may remain technically valid until their natural `exp`, but no new tokens can be minted.

### 4.2 Capacitor Hybrid Apps

Capacitor apps act like web, but with access to native secure storage.

**Flow:**

- Initial login can reuse the exact same web-based login UI:
  - Use an in-app browser / webview to drive the standard login page.
  - After login, exchange a short-lived login proof (authorization code or IdP cookie) for tokens via `/v1/auth/token`.
- Auth-core issues access + refresh tokens, tied to a `Session` with `type = 'mobile'` or `'web'` as appropriate.
- Capacitor app stores both in platform secure storage (not localStorage).
- All API calls: `Authorization: Bearer <access_token>`.

No special-case API layer – same endpoints as web.

### 4.3 Fully Native iOS/Android Apps

Preferred flow: OAuth 2.1 Authorization Code + PKCE.

**Flow (conceptual):**

1. Native app opens system browser/SFAuthenticationSession to:

       GET /v1/oauth/authorize?client_id=mobile&redirect_uri=superbasic://callback&code_challenge=...&code_challenge_method=S256&...

2. User logs in via IdP (same flows as web).

3. Server redirects to:

       superbasic://callback?code=AUTH_CODE

4. Native app receives the code and calls:

       POST /v1/oauth/token
       {
         "grant_type": "authorization_code",
         "code": "AUTH_CODE",
         "redirect_uri": "superbasic://callback",
         "client_id": "mobile",
         "code_verifier": "..."
       }

5. Auth-core:
   - Validates the code + PKCE.
   - Creates a `Session` (`type = 'mobile'`).
   - Issues access + refresh tokens.

6. Native app stores tokens in secure storage and uses them for API calls.

**Token refresh:**

- Same `/v1/auth/refresh` endpoint shared with web/Capacitor.

### 4.4 CLI, Automation, 3rd-Party Integrations

**Flow:**

- Users create PATs via:
  - Web UI.
  - Or REST endpoints:
    - `POST /v1/tokens` → create PAT.
    - `GET /v1/tokens` → list PATs.
    - `PATCH /v1/tokens/:id` → rename.
    - `DELETE /v1/tokens/:id` → revoke.

- PATs are shown once, never retrievable.

- Clients call:

       Authorization: Bearer sbf_<token>

- Auth-core:
  - Recognizes PAT format.
  - Looks up hash.
  - Validates scopes, revocation, expiry, workspace binding, user status.
  - Builds appropriate `AuthContext`.

Longer-term, 3rd-party integrations may also use OAuth client credentials / app flows, but PATs are sufficient for v1.

### 4.5 Partners and OAuth

When third-party partners are supported:

- They will typically use:
  - Authorization Code + PKCE (public clients), or
  - Client Credentials (confidential server-side clients).
- All such flows are implemented via `/v1/oauth/authorize` and `/v1/oauth/token` backed by the same auth-core and token machinery.
- Scope and workspace semantics remain unchanged; partners obtain tokens limited to the scopes granted by the user or by configuration.

---

## 5. API Surface (Auth Endpoints)

All paths assume prefix: `/v1`.

### 5.1 Auth core endpoints

- **GET `/v1/auth/session`**

  Returns current session info derived from an access token:

      {
        "user": { "id": "user_123", "email": "user@example.com", "name": "..." },
        "session": {
          "id": "sess_abc",
          "type": "web",
          "kind": "persistent",
          "createdAt": "...",
          "lastUsedAt": "...",
          "expiresAt": "...",
          "absoluteExpiresAt": "..."
        },
        "activeWorkspaceId": "ws_123",
        "scopes": ["read:transactions", "write:budgets", "read:profile"],
        "roles": ["owner"],
        "mfaLevel": "mfa"
      }

- **POST `/v1/auth/token`**

  Exchange a login proof for first-party tokens.

  Inputs (depending on flow):
  - Authorization code (for OAuth+PKCE).
  - Or a short-lived IdP session cookie / token (for web/Capacitor BFF).

  Output:

      {
        "accessToken": "<jwt>",
        "refreshToken": "<opaque>",
        "expiresIn": 1800
      }

- **POST `/v1/auth/refresh`**

  Body:

      { "refreshToken": "<opaque>" }

  or refresh token via HttpOnly cookie (plus CSRF protections; see Security).

  Output same shape as `/v1/auth/token`.

  Implements **mandatory refresh token rotation** with reuse detection and family-level revocation on reuse incidents.

- **POST `/v1/auth/logout`**

  - Revokes:
    - Current session (`sessions.revokedAt = now`).
    - All associated refresh tokens (entire `familyId`).
  - Clears cookies (for web/Capacitor).
  - Leaves any existing access tokens to expire naturally within their short TTL.

- **GET `/v1/auth/sessions`**

  - List active sessions for current user (web/mobile devices).
  - Return metadata for “logged in devices” UI.

- **DELETE `/v1/auth/sessions/:id`**

  - Revoke a session (log out device remotely).
  - Revokes active refresh tokens belonging to that session.

- **GET `/v1/auth/jwks.json`** (plus `/.well-known/jwks.json`)

  - Returns the current JWKS for verifying access tokens.
  - Contains only public key material and `kid` values.

### 5.2 OAuth-style endpoints (for native PKCE / partners)

Only needed if you adopt OAuth2-style flows for mobile/partners.

- **GET `/v1/oauth/authorize`**
  - Standard OAuth endpoint (supports PKCE).
  - Delegates identity verification to IdP.
  - Issues authorization codes bound to:
    - `client_id`
    - `redirect_uri`
    - `code_challenge`
    - `userId`
    - requested `scopes`
  - Authorization codes are:
    - **Single-use**
    - **Short-lived** (e.g. 5–10 minutes)
    - Stored server-side with the above metadata.

- **POST `/v1/oauth/token`**
  - Exchanges authorization code for access/refresh tokens.
  - Compatible with PKCE (requires `code_verifier`).
  - On invocation, the authorization code:
    - Is looked up and validated (client, redirect URI, PKCE, expiry).
    - Is **deleted regardless of success** (single-use).
  - Can be implemented as a thin wrapper over auth-core APIs.

### 5.3 PAT Management endpoints

Conceptually part of the auth-core surface:

- `POST /v1/tokens` – create PAT.
- `GET /v1/tokens` – list PATs.
- `DELETE /v1/tokens/:id` – revoke PAT.
- `PATCH /v1/tokens/:id` – rename PAT.

Responses should include:

- Name, scopes, createdAt, lastUsedAt, expiresAt, masked token (e.g. `sbf_****abcd`), workspace binding.

---

## 6. Authorization Model

### 6.1 Scopes

Keep the existing scope system as the primitive:

- Data-level scopes (typically workspace-scoped):
  - `read:transactions`, `write:transactions`
  - `read:budgets`, `write:budgets`
  - `read:accounts`, `write:accounts`
- User/global scopes:
  - `read:profile`, `write:profile` (global)
- Workspace-level / admin scopes (future):
  - `read:workspaces`, `write:workspaces`
  - `manage:members`
  - `admin`

All authorization checks are ultimately in terms of scopes.

`AuthContext.scopes` contains:

- All scopes effective for the `activeWorkspaceId` (based on membership and roles), and
- Any global scopes the user has (e.g. `read:profile`), regardless of workspace.

**Important:** Scopes are **not taken from access tokens**; they are recomputed on every request from:

- `userId` + `activeWorkspaceId`
- `WorkspaceMembership` and role-to-scope mapping
- PAT configuration (for PAT-based requests)
- `User.status` (must be `'active'`)

Tokens may contain hints (e.g. `wid`), but no authority-bearing scopes.

### 6.2 Roles & Workspaces (RBAC on top of scopes)

Map workspace roles to scopes via a central mapping, e.g.:

- `owner`
  - All scopes including admin actions.
- `admin`
  - Manage members, budgets, accounts, etc.
- `member`
  - Typical read/write on their workspace data, no member management.
- `viewer`
  - Read-only scopes.

The role-to-scope mapping is:

- Defined centrally in auth-core (config or DB).
- Used both when:
  - Computing `AuthContext.scopes` for a workspace.
  - Performing role-to-scope reasoning in `AuthzService`.

Auth-core should provide helpers like:

    AuthzService.requireScope(authContext, 'write:transactions');
    AuthzService.requireRole(authContext, 'owner', { workspaceId });

Route handlers:

- Use Zod to validate inputs.
- Use `AuthzService` for authorization decisions.
- Throw domain-level `AuthorizationError` which gets mapped to HTTP 403 by route handlers.

### 6.3 Multi-Tenancy

Multi-tenancy must be airtight:

- Access tokens may include `wid` as a **hint**, but membership is always validated server-side.
- Clients can:
  - Select an active workspace via API/URL (e.g. `/workspaces/:id/...`).
  - Or pass `X-Workspace-Id` header.

**Single source of truth per request:**

- Auth middleware derives `activeWorkspaceId` with clear precedence:
  - If a route has a `:workspaceId` path param, that **always wins** and becomes the `activeWorkspaceId`.
  - Else, look at `X-Workspace-Id` header (if present).
  - Else, fallback to user’s default/last-used workspace.
- For the chosen workspace:
  - Verify that a `WorkspaceMembership(userId, workspaceId)` exists.
  - Resolve roles & scopes accordingly.
- `AuthContext.activeWorkspaceId` and `AuthContext.roles/scopes` are always consistent with an actual membership (or null if no workspace is active).
- If a header or JWT `wid` hint conflicts with a path param, **the path param wins**; hints are ignored/overridden.

**Repository & database-level safety:**

- Repositories never see tokens or cookies.
- Any workspace-scoped data access requires `workspaceId` as an argument.
- Repository queries are always filtered by `workspaceId` where applicable.
- Avoid “by userId only” queries that can unintentionally cross tenants.
- When obtaining a DB connection, the API layer sets Postgres GUCs from `AuthContext` (e.g. `app.user_id`, `app.workspace_id`, `app.mfa_level`) and **RLS policies** enforce tenant boundaries and additional security invariants at the database level.

### 6.4 Service-level rules

- Services:
  - Accept `AuthContext` and domain-level inputs.
  - Enforce business-level constraints (e.g. “only owner can delete workspace”, “only admin can manage members”).
- Provide helpers like:

    AuthzService.requireWorkspaceRole(auth, 'owner');

so logic is easy to audit and reuse.

---

## 7. Integration with Hono 3-Layer Architecture

### 7.1 Middleware

Create an auth middleware in `apps/api` that:

1. Extracts credentials:
   - `Authorization: Bearer <token>` (access JWT or PAT).
   - For `/auth/*` endpoints, also consider refresh token cookies.

2. Delegates to `AuthService.verifyRequest` in `packages/auth-core`:

       const authContext = await AuthService.verifyRequest({
         authorizationHeader: req.headers.get('authorization'),
         cookies: parseCookies(req),
         ipAddress: ...,
         userAgent: ...,
         url: req.url,
         headers: req.headers,
       });

3. `AuthService.verifyRequest`:
   - Distinguishes JWT vs PAT.
   - Verifies tokens.
   - Checks `User.status === 'active'`.
   - Resolves `activeWorkspaceId` and roles via membership, with precedence:
     - Path param workspace ID (if present) → wins.
     - Else `X-Workspace-Id` header.
     - Else default/last-used workspace.
   - Derives `clientType: ClientType` **primarily from how the token was issued**, not from user agent:
     - Sessions created via SPA login → `clientType = 'web'`.
     - Sessions created via OAuth client `client_id = 'mobile'` → `clientType = 'mobile'`.
     - PATs created via CLI/UI for automation → `clientType = 'cli'` (or `'partner'` for partner integrations).
   - User agent strings may be used as a **secondary hint for UX and logs**, but are **not trusted for security-critical decisions**.

4. Attaches `authContext` to request context (e.g. `c.var.auth`).

5. For public endpoints, `authContext` may be `null` (must be explicit).

6. When a DB client is acquired, the request layer (or a lower-level DB wrapper) sets Postgres GUCs from `authContext` (`app.user_id`, `app.workspace_id`, etc.) so that RLS policies are consistently enforced.

### 7.2 Route Handlers

Route handlers:

- Do not parse tokens or hit the DB directly for auth.
- Assume `authContext` is present & valid when required.

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

### 7.3 Services & Repositories

- Services:
  - Accept `AuthContext` and domain-level inputs.
  - Perform business-level access control and workspace validations.
- Repositories:
  - Never see tokens or cookies.
  - Operate on `userId`, `workspaceId`, etc., as plain primitives.
  - Rely on both explicit filters and RLS (via GUCs) for tenant isolation.

---

## 8. Security Controls

### 8.1 Cookie Configuration, CORS & CSRF

For web/Capacitor flows that use cookies:

- `sbf_rt` (refresh token cookie):
  - `HttpOnly: true`
  - `Secure: true` (production)
  - `SameSite: Lax` or `Strict` depending on UX
  - `Domain` & `Path` aligned with API host.

**Cross-subdomain considerations (e.g. `app.superbasic.finance` SPA → `api.superbasic.finance` API):**

- If SPA and API are on different subdomains:
  - `Domain` for cookies may need to be `.superbasic.finance` to be shared.
  - `SameSite` must be chosen so that cross-subdomain requests work as intended (often `Lax` is sufficient; `None` requires `Secure`).
  - CORS must allow:
    - `Origin: https://app.superbasic.finance`
    - `Access-Control-Allow-Credentials: true`
    - `Access-Control-Allow-Headers` including any custom headers.
  - Frontend must use `credentials: 'include'` for requests that rely on cookies (e.g. refresh, logout).

**CSRF protection:**

- Any endpoint that relies on cookies for auth (e.g. `/v1/auth/refresh`, `/v1/auth/logout`) must be CSRF-safe:
  - Use `SameSite=Lax` or `Strict` for auth cookies, and
  - Require either:
    - A CSRF token (double-submit cookie + header), or
    - A non-simple custom header (e.g. `X-CSRF-Token`, `X-Requested-With`) that browsers cannot send via plain HTML forms.
- Endpoints that accept cookies but not Authorization headers **must not** be callable via cross-site forms; otherwise, CSRF remains possible.
- Alternatively, for SPAs, prefer sending refresh tokens in the request body explicitly (no cookie) and treat `/auth/refresh` as an explicit `Authorization: Bearer`-like call.

No access tokens in localStorage or non-HttpOnly cookies for web.

### 8.2 Token Storage & Hashing

- Refresh tokens & PATs:
  - Stored as SHA-256 hashes.
  - Optionally include a global secret pepper from env/KMS.
  - Plaintext never stored; only shown once to the user.
  - Store a short prefix (e.g. first 4 chars) separately for UI display (masked token).

- Access tokens:
  - Never stored server-side – rely on signature + expiry.
  - Optionally track used `jti` values in logs for correlation/blacklisting.

### 8.3 Rate Limiting & Brute Force Protection

Apply per-IP and per-user rate limits on:

- Login attempts.
- Token refresh.
- PAT creation.
- Sensitive endpoints (e.g. password changes, MFA changes at the IdP layer).

Add account lockout / captcha hooks at the IdP layer for repeated failures.

### 8.4 Session Lifetime & Sliding Expiration

Define clear semantics:

- `session.createdAt`:
  - When the session was created.
- `session.absoluteExpiresAt`:
  - Hard maximum lifetime since creation (e.g. 180 days); the session cannot be extended past this.
- `session.lastUsedAt`:
  - Updated on meaningful authenticated requests and token refreshes (throttled).
- `session.expiresAt`:
  - Inactivity timeout (e.g. 30 days after `lastUsedAt`), but always:
    - `session.expiresAt <= session.absoluteExpiresAt`.
- `session.kind`:
  - May influence inactivity window and/or `absoluteExpiresAt` (e.g. `kind = 'short'` → shorter inactivity; `kind = 'persistent'` → longer, within bounds).

On successful refresh:

- `session.lastUsedAt` is updated.
- `session.expiresAt` may be extended to `lastUsedAt + inactivityWindow(kind)`, capped by `absoluteExpiresAt`.

Once `now > session.expiresAt` or `now > session.absoluteExpiresAt`:

- The session is expired.
- All refresh tokens for that session are unusable, regardless of their individual `expiresAt`.

When `User.status` is set to `'disabled'` or `'locked'`:

- All sessions and refresh tokens for that user must be revoked immediately.

### 8.5 MFA / Additional Factors (Future)

Architecture should leave room to add:

- TOTP-based MFA.
- WebAuthn / Passkeys.
- SMS/Email-based second factor (less preferred).

MFA is implemented at the IdP layer, but auth-core can record:

- `session.mfaLevel` or `authContext.mfaLevel` to gate sensitive actions (e.g. enabling bank connections, managing workspaces).

#### 8.5.1 Step-up / re-authentication flows

For especially sensitive actions (e.g. linking a bank account, changing password):

- Require the user to **re-authenticate** even if they already have a session:
  - Re-enter password or complete a stronger factor (e.g. WebAuthn).
- Implementation options:
  - Issue a **short-lived access token** with a higher `mfaLevel` or a `recentlyAuthenticatedAt` claim, or
  - Mark the existing session as “recently authenticated” with a timestamp in the session record.
- Domain-level checks then require:
  - `mfaLevel` ≥ required threshold, and
  - `recentlyAuthenticatedAt` within a configured window (e.g. last 5–15 minutes).

### 8.6 Auditing & Logging

All auth events produce structured audit logs:

- Login success/failure.
- Token creation/rotation.
- Token reuse detection incidents.
- Session revocation.
- PAT operations.
- Account disabling/locking events.

Guidelines:

- Never log full tokens.
- Log:
  - `userId`, `sessionId`, `tokenId`, `familyId`
  - `ip`, `userAgent` (possibly truncated or anonymized)
  - `action` (`login_success`, `refresh_reuse_detected`, etc.)
- Be cautious logging raw IPs and full user agents if there are strict privacy/compliance goals:
  - Consider truncating IP addresses (e.g. /24 for IPv4, /48 for IPv6) or anonymizing them.
  - Limit user agent logging to what’s needed for security and debugging.
- IP / UA logging must follow the company privacy policy and any truncation/anonymization strategy defined there.
- `tokens.lastUsedAt` updated on successful use (throttled for performance).
- `sessions.lastUsedAt` updated on meaningful requests and refreshes.

### 8.7 Error Model for Auth Endpoints

Auth-related endpoints (`/v1/auth/*`, `/v1/oauth/*`, `/v1/tokens`) should return consistent JSON errors:

Example:

    {
      "error": "invalid_grant",
      "error_description": "Refresh token has been revoked"
    }

Error codes (non-exhaustive):

- `invalid_request` (400)
  - Missing or malformed parameters (e.g. no `code_verifier` for PKCE).
- `invalid_grant` (401)
  - Invalid, expired, revoked, or reused token (access or refresh).
- `unauthorized` (401)
  - No valid authentication provided where required.
- `forbidden` (403)
  - Authentication present, but missing required scope/role (mapped from `AuthorizationError`).
- `invalid_client` (401/403)
  - OAuth client/secret problems (for future confidential clients).

This error model also applies to non-auth endpoints when they fail for auth reasons (e.g. missing scopes).

### 8.8 Performance Considerations

While correctness and security come first, performance will matter as load grows:

- Per-request work typically includes:
  - Verifying an access token (signature, expiry).
  - Looking up `Session` (for session-backed flows).
  - Resolving `WorkspaceMembership` and roles for the active workspace.
- To reduce repeated lookups:
  - Use a **role/membership cache** (in-process or distributed) keyed by `(userId, workspaceId)` with a small TTL (e.g. 30–120 seconds).
  - Invalidate or refresh when membership changes are detected.
- JWKS:
  - Internal JWKS is static per deployment and can be cached aggressively by clients.
  - For any external IdPs using JWKS (e.g. Auth0, enterprise IdPs), cache their JWKS responses within a reasonable TTL and respect `kid` changes.
- All caching must be layered under strict expiry and must **never** bypass core security checks (e.g. membership existence, user disabled status).
- Because scopes and workspace membership are not embedded in JWTs, **DB/cache availability directly impacts authorization**; plan infra and fallbacks accordingly.

---

## 9. Operational & UX Considerations

### 9.1 “Manage Devices” Page

Backed by `/v1/auth/sessions` + `/v1/auth/sessions/:id`:

- Show:
  - Device type, browser, IP (approximate region).
  - Created at, last active time.
  - Session kind (`short` vs `persistent`).
- Allow user to:
  - Revoke sessions (log out other devices).

### 9.2 “API Tokens” Page

Backed by `/v1/tokens` endpoints:

- Show:
  - Name, scopes, created at, last used, expiry, masked token, workspace binding.
- Allow:
  - Create tokens with scopes (and optional workspace).
  - Rename.
  - Revoke.

### 9.3 Incident Response

If token compromise suspected:

- Admin/support can:
  - Revoke:
    - User sessions (kill device logins).
    - Specific PATs.
    - All tokens in a refresh token `familyId`.
  - Inspect logs pertaining to a token/user/familyId.
- Consider an internal API / admin tool to:
  - Trigger “log out of all devices” for a user.
  - Mark an incident for downstream alerting.

### 9.4 Account Deletion

When a user deletes their account (or requests deletion):

- Revoke all active sessions and refresh tokens for that user.
- Revoke all PATs and other long-lived tokens.
- Handle workspaces:
  - If the user is the only owner:
    - Either delete the workspace (and associated data) or mark it as “orphaned” and queue it for cleanup according to product and compliance rules.
  - If the workspace has other owners:
    - Remove the user’s memberships and transfer any explicit ownership responsibilities if required.
- Audit logs:
  - Consider anonymizing or pseudonymizing user identifiers in logs where required by policy or regulation, while retaining security-relevant signal.
- Follow the product’s data retention / GDPR-style data policies for actual data deletion vs retention.

---

## 10. IdP Agnostic Design

The choice of IdP (Auth.js vs Auth0 vs other) is intentionally orthogonal:

All identity providers must implement an internal interface, e.g.:

    interface IdentityProvider {
      authenticateWithCredentials(email: string, password: string): Promise<VerifiedIdentity>;
      initiateOAuth(provider: 'google' | 'apple' | ...): RedirectUrl;
      handleOAuthCallback(query: URLSearchParams): Promise<VerifiedIdentity>;
      sendMagicLink(email: string): Promise<void>;
      verifyMagicLink(token: string): Promise<VerifiedIdentity>;
      // Future: handleSamlResponse, handleOidcLogout, etc.
    }

Auth-core consumes only `VerifiedIdentity` and the identity linking rules described in 2.3.

**Data model separation:**

- `User` is the internal canonical account (`profiles`).
- `UserIdentity` links external IdP accounts to `User`.
- Switching providers does not affect:
  - Token formats.
  - Auth endpoints.
  - `AuthContext`.
  - PATs, scopes, or sessions.

Password resets, email verification, and MFA:

- Live primarily at the IdP layer.
- Auth-core only needs to know:
  - That the identity is verified (`emailVerified`, `mfaLevel`).
  - The resulting `userId`.

**Email changes in the IdP:**

- If a user changes their email in Auth0/Auth.js:
  - On the next successful login, `VerifiedIdentity.email` and `emailVerified` will reflect the new value.
  - Auth-core applies the email sync rules described in 2.4 to keep `User.email` up to date without breaking uniqueness.

**Back-channel logout / SSO logout:**

- For enterprise SSO (SAML/OIDC) where the IdP supports back-channel logout:
  - The IdP can notify SuperBasic Finance that a user/session should be logged out.
  - The IdP integration layer translates that into:
    - A lookup of affected `userId` and/or `sessionId`.
    - Revoking corresponding sessions and refresh tokens using the same primitives as `/v1/auth/logout`.
  - This ensures consistency between IdP session state and SuperBasic’s own sessions.

### 10.1 Migration: Auth.js → Auth0 (or another IdP)

The design intentionally supports future IdP switches:

- Existing data:
  - `User` remains the canonical internal account.
  - `UserIdentity` rows currently have providers like `'authjs:credentials'`, `'authjs:google'`, `'authjs:email'`.
- Introducing Auth0:
  - New logins from Auth0 produce `VerifiedIdentity` with:
    - `provider = 'auth0:<connection>'` (e.g. `'auth0:default'`),
    - `providerUserId = auth0UserId`,
    - `email`, `emailVerified`, etc.
- Linking behavior:
  - For returning users:
    - On first Auth0 login, if `emailVerified === true` and an existing `User` with that email is found, create a new `UserIdentity` row for `provider = 'auth0:<connection>'`, pointing to the existing `userId`.
  - For new users:
    - Create a new `User` and `UserIdentity` as usual.
- Migration steps:
  - Keep old Auth.js-based flows active during migration if needed.
  - Gradually encourage users to log in via Auth0, which will backfill `UserIdentity` rows.
  - Once all active users have relevant Auth0 identities, Auth.js can be phased out.
- Throughout this process:
  - Access/refresh tokens, PATs, scopes, sessions, and `AuthContext` remain unchanged.
  - Only the `IdentityProvider` implementation and `UserIdentity` population change.

This ensures that in 2+ years, if you decide to move from Auth.js to Auth0 (or something else), the rest of the app continues to function with minimal changes.

---

## 11. Summary

The end-state auth system for SuperBasic Finance should:

- Centralize all token + session logic in a first-party auth-core.
- Use:
  - Short-lived JWT access tokens (asymmetric signing, `kid`-based rotation) for all clients, **without encoding scopes in the JWT**, and with clear logout semantics (revocation applies to refresh/PATs; access tokens expire naturally).
  - Long-lived, hashed refresh tokens tied to sessions, with mandatory rotation, reuse detection, explicit handling of edge cases, and an invariant of at most one active refresh token per family.
  - Scoped, hashed PATs for programmatic access, with optional workspace binding, strict membership checks, and user-status checks.
- Provide a single, stable `AuthContext` abstraction used throughout the app, with clear workspace semantics and global scopes where appropriate, and accept that authorization requires DB/cache lookups in addition to JWT validation.
- Support:
  - Web SPA.
  - Capacitor shells.
  - Fully native mobile using OAuth2 + PKCE.
  - CLI / integrations via PATs (and future OAuth app flows).
- Be IdP-agnostic, making Auth.js/Auth0/etc. a swappable detail behind `IdentityProvider`, including support for back-channel logout and a concrete migration path (Auth.js → Auth0).
- Be ready for:
  - Multi-tenant workspaces with strong isolation (RLS + explicit filters).
  - Roles and scopes with centralized mapping and server-side scope derivation.
  - MFA, step-up auth, and SSO in the future.
  - Robust incident response and auditability that align with privacy and data retention policies.
  - Reasonable performance via caching of membership/roles and JWKS where appropriate, while never bypassing core security checks.

This design aims to make auth a one-time heavy lift now, with only incremental, additive changes later rather than large-scale rewrites, while keeping you decoupled from any single IdP provider.

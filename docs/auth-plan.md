# Auth Architecture Plan (`auth-plan.md`)

> Goal: Define the end-state authentication & authorization architecture for SuperBasic Finance that:
> - Works cleanly for web, Capacitor, and fully native mobile.
> - Is IdP-agnostic (Auth.js today, Auth0/other tomorrow).
> - Minimizes future refactors by centralizing auth into a single, well-defined core.
> - Meets modern security expectations (short-lived access, refresh rotation, scoped tokens).

This document describes the target polished design, not how to migrate from the current implementation.

---

## 1. High-Level Design

### 1.1 Core idea

Split auth into two conceptual layers:

1. **Identity Provider (IdP)** – proves *who* the user is.

   Could be:
   - Auth.js + own DB (credentials, Google, magic link, etc.)
   - Auth0 / another hosted provider

   Output: a **Verified Identity** (`userId`, email, etc.) after login.

2. **First-Party Auth Core** – manages *how clients access the API*.

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

Core domain types (independent of Auth.js/Auth0):

- **User**
  - `id`
  - `email`
  - `status` (`active`, `disabled`, etc.)
  - Profile attributes (name, avatar, etc.)

- **Session**
  - Represents a *login on a specific device/browser*.
  - `id`
  - `userId`
  - `type`: `'web' | 'mobile' | 'cli' | 'other'`
  - `userAgent`
  - `ipAddress`
  - `deviceName` (optional)
  - `createdAt`
  - `expiresAt`
  - `revokedAt` (null if active)

- **Token**
  - Used for refresh + PATs (not access tokens).
  - `id`
  - `userId`
  - `sessionId` (nullable; null for PATs)
  - `type`: `'refresh' | 'personal_access'`
  - `tokenHash` (SHA-256)
  - `scopes: string[]`
  - `name` (for PATs – “Mobile App”, “CI/CD Pipeline”)
  - `createdAt`
  - `lastUsedAt`
  - `expiresAt`
  - `revokedAt`

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
    - Future: `read:workspaces`, `write:workspaces`, `admin`, etc.

### 2.2 AuthContext

The only thing downstream services should see is an `AuthContext`, provided by auth middleware:

    type AuthContext = {
      userId: string;
      sessionId: string | null; // null for PATs
      scopes: string[];
      // Multi-tenancy
      activeWorkspaceId: string | null;
      // Roles/permissions for that workspace
      roles: string[];          // ['owner', 'admin', ...]
      // Request-scoped metadata
      requestId?: string;
      clientType: 'web' | 'mobile' | 'cli' | 'partner';
    };

- Route handlers in Hono read this from context (e.g. `c.var.auth`).
- Services in `packages/core` receive `AuthContext` as an argument (or via DI).
- Nothing outside the auth-core needs to parse tokens or know about Auth.js/Auth0 internals.

---

## 3. Token Strategy

There are three main token types in the end-state:

1. **Access Tokens** – Short-lived JWTs.
2. **Refresh Tokens** – Long-lived, opaque, hashed in DB.
3. **Personal Access Tokens (PATs)** – Long-lived, opaque, hashed in DB, for programmatic access.

### 3.1 Access Tokens (JWT)

- **Format:** JWT, signed (HS256 or RS256).
- **Lifetime:** 10–30 minutes (configurable, short).
- **Where used:** `Authorization: Bearer <access_token>` header for all clients (web, mobile, CLI, partners).

**Claims:**

    {
      "iss": "https://api.superbasic.finance", // issuer
      "sub": "user_123",                       // userId
      "sid": "sess_abc",                       // sessionId (null for PATs, or omitted)
      "scp": ["read:transactions", "write:budgets"],
      "wid": "ws_123",                         // active workspace id (optional)
      "exp": 1700000000,                       // expiry (seconds since epoch)
      "iat": 1699990000,                       // issued at
      "typ": "access"
    }

- **Storage:**
  - Web: in memory (e.g. React state) or in an HTTP-only cookie via a Backend For Frontend (BFF) pattern.
  - Mobile: secure storage (Keychain / Keystore).
  - CLI: environment variables / config files (never committed).

### 3.2 Refresh Tokens

- **Format:** Random 256-bit string (e.g. base64url).
- **Stored:** Only as hash in DB (`tokenHash`).
- **Lifetime:** 30–90 days (configurable); 1 per active session.

**Usage:**

- Client calls `/v1/auth/refresh` with refresh token.
- Server:
  - Hashes it.
  - Looks up in `tokens` where `type = 'refresh'` and `revokedAt IS NULL` and `expiresAt > now`.
  - Verifies associated `session` is active.
- On success:
  - Issues a new access token.
  - Rotates refresh token (optional but recommended):
    - Marks old token as `revokedAt = now`.
    - Creates a new refresh token row.
  - Returns:

        {
          "accessToken": "<jwt>",
          "refreshToken": "<opaque>"
        }

- **Binding:** Refresh tokens are tied to a **session** (for device-level control).

### 3.3 Personal Access Tokens (PATs)

- **Format:** `sbf_<43 base64url chars>` (current design).
- **Stored:** Hash (SHA-256).
- **Lifetime:** Configurable expiry, or long-lived with strong monitoring.
- **Scopes:** Mandatory – PATs are always scoped.

**Usage:**

- `Authorization: Bearer sbf_...`
- Core distinguishes PAT vs access JWT by prefix/format.

**Behavior:**

- PAT-authenticated requests:
  - Use `sessionId = null` in `AuthContext`.
  - Use scopes from PAT record.
  - Are typically restricted to API-like usage (no UI-only endpoints).

---

## 4. Supported Client Types & Flows

### 4.1 Web SPA (browser-based)

**Login:**

- User authenticates through IdP:
  - Email/password, OAuth (Google, etc.), magic link.
- IdP adapter returns `VerifiedIdentity` to auth-core:

    type VerifiedIdentity = {
      userId: string;
      email: string;
      // other claims (emailVerified, etc.)
    };

**Session & token issuance:**

- Auth-core creates a `Session` row (`type = 'web'`).
- Auth-core issues:
  - Access token (JWT, short-lived).
  - Refresh token (opaque, tied to session).

- Web client stores:
  - Access token in memory (or `Secure, HttpOnly` cookie managed via BFF).
  - Refresh token, preferably as an HttpOnly cookie for browser flows (`sbf_rt`), same-origin.

**API calls:**

- SPA adds `Authorization: Bearer <access_token>` to API requests.
- When access token expires:
  - SPA calls `/v1/auth/refresh` (with refresh token cookie or body).
  - Gets new access + refresh pair.

### 4.2 Capacitor Hybrid Apps

Capacitor apps act like web, but with access to native secure storage.

**Flow:**

- Initial login can reuse the exact same web-based login UI:
  - Use an in-app browser / webview to drive the standard login page.
  - After login, exchange a code or cookie for tokens via `/v1/auth/token`.
- Auth-core issues access + refresh tokens.
- Capacitor app stores both in platform secure storage (not localStorage).
- All API calls: `Authorization: Bearer <access_token>`.

No special-case API layer – same endpoints as web.

### 4.3 Fully Native iOS/Android Apps

Long-term preferred flow: OAuth 2.1 Authorization Code + PKCE.

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
    - `GET /v1/tokens` → list.
    - `PATCH /v1/tokens/:id` → rename.
    - `DELETE /v1/tokens/:id` → revoke.

- PATs are shown once, never retrievable.

- Clients call:

      Authorization: Bearer sbf_<token>

- Auth-core:
  - Recognizes PAT format.
  - Looks up hash.
  - Validates scopes, revocation, expiry.
  - Builds appropriate `AuthContext`.

---

## 5. API Surface (Auth Endpoints)

This section describes the end-state API, independent of whether the IdP is Auth.js or Auth0.

All paths assume prefix: `/v1`.

### 5.1 Auth core endpoints

- **GET `/v1/auth/session`**

  Returns current session info derived from an access token:

      {
        "user": { "id": "user_123", "email": "user@example.com", "name": "..." },
        "session": { "id": "sess_abc", "type": "web", "expiresAt": "..." },
        "activeWorkspaceId": "ws_123",
        "scopes": ["read:transactions", "write:budgets"],
        "roles": ["owner"]
      }

- **POST `/v1/auth/token`**

  Exchange a login proof for first-party tokens.

  Inputs (depending on flow):
  - Authorization code (for OAuth+PKCE).
  - Or a short-lived IdP session cookie (for web/Capacitor BFF).

  Output:

      {
        "accessToken": "<jwt>",
        "refreshToken": "<opaque>",
        "expiresIn": 1800
      }

- **POST `/v1/auth/refresh`**

  Body:

      { "refreshToken": "<opaque>" }

  or refresh token via HttpOnly cookie.

  Output same shape as `/v1/auth/token`.

  Implements refresh token rotation.

- **POST `/v1/auth/logout`**

  - Revokes:
    - Current session (`sessions.revokedAt = now`).
    - All associated refresh tokens.
  - Clears cookies (for web/Capacitor).

- **GET `/v1/auth/sessions`**

  - List active sessions for current user (web/mobile devices).
  - Return metadata for “logged in devices” UI.

- **DELETE `/v1/auth/sessions/:id`**

  - Revoke a session (log out device remotely).

### 5.2 OAuth-style endpoints (for native PKCE)

Only needed if you adopt OAuth2-style flows for mobile/partners.

- **GET `/v1/oauth/authorize`**
  - Standard OAuth endpoint (supports PKCE).
  - Delegates identity verification to IdP.

- **POST `/v1/oauth/token`**
  - Exchanges authorization code for access/refresh tokens.
  - Compatible with PKCE.

(These can simply be wrappers around your auth-core APIs.)

### 5.3 PAT Management endpoints

Conceptually part of the auth-core surface:

- `POST /v1/tokens` – create PAT.
- `GET /v1/tokens` – list PATs.
- `DELETE /v1/tokens/:id` – revoke PAT.
- `PATCH /v1/tokens/:id` – rename PAT.

---

## 6. Authorization Model

### 6.1 Scopes

Keep the existing scope system as the primitive:

- Data-level scopes:
  - `read:transactions`, `write:transactions`
  - `read:budgets`, `write:budgets`
  - `read:accounts`, `write:accounts`
  - `read:profile`, `write:profile`
- Workspace-level scopes (future):
  - `read:workspaces`, `write:workspaces`
  - `manage:members`
  - `admin`

### 6.2 Roles & Workspaces (RBAC on top of scopes)

Map workspace roles to scopes:

- `owner`
  - all scopes including admin actions.
- `admin`
  - manage members, budgets, accounts, etc.
- `member`
  - typical read/write on their workspace data, no member management.
- `viewer`
  - read-only scopes.

Auth-core should provide helpers like:

    AuthzService.checkScope(authContext, 'write:transactions');
    // or
    AuthzService.requireRole(authContext, 'owner', { workspaceId });

Route handlers:

- Use Zod to validate inputs.
- Use `AuthzService` for authorization decisions.
- Throw domain-level `AuthorizationError` which gets mapped to HTTP `403` by route handlers.

### 6.3 Multi-Tenancy

- Access tokens include an optional active workspace ID (`wid`).
- Clients can:
  - Select an active workspace via API/URL.
  - Or pass `X-Workspace-Id` header.
- Auth middleware derives `activeWorkspaceId` and roles from membership.
- Services enforce workspace scoping automatically where possible (e.g. repositories always filter by `workspaceId`).

---

## 7. Integration with Hono 3-Layer Architecture

### 7.1 Middleware

Create an auth middleware in `apps/api` that:

1. Extracts credentials:
   - `Authorization: Bearer <token>` (access JWT or PAT).
   - (For certain flows) refresh token cookies for `/auth/*` endpoints.

2. Delegates to `AuthService.verifyRequest` in `packages/auth-core`:

       const authContext = await AuthService.verifyRequest({
         authorizationHeader: req.headers.get('authorization'),
         cookies: parseCookies(req),
         ipAddress: ...,
         userAgent: ...,
       });

3. Attaches `authContext` to request context (e.g. `c.var.auth`).

4. For public endpoints, `authContext` may be `null` (must be explicit).

### 7.2 Route Handlers

Route handlers:

- Do not parse tokens or hit the DB directly.
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
  - Perform any business-level access control (e.g. “only owner can delete workspace”).

- Repositories:
  - Never see tokens, never see cookies.
  - Operate on `userId`, `workspaceId`, etc., as plain primitives.

---

## 8. Security Controls

### 8.1 Cookie Configuration (where used)

For web/Capacitor flows that use cookies:

- `sbf_rt` (refresh token cookie):
  - `HttpOnly: true`
  - `Secure: true` (production)
  - `SameSite: Lax` or `Strict` depending on UX
  - `Domain` & `Path` aligned with API host.

No access tokens in localStorage or non-HttpOnly cookies for web.

### 8.2 Token Storage & Hashing

- Refresh tokens & PATs:
  - Stored as SHA-256 hashes, with prefix/metadata stored separately.
  - Plaintext never stored; only shown once to the user.

- Access tokens:
  - Never stored server-side – rely on signature + expiry.

### 8.3 Rate Limiting & Brute Force Protection

Per-IP and per-user rate limits on:

- Login attempts.
- Token refresh.
- PAT creation.

Account lockout / captcha hooks can be added later for repeated failures.

### 8.4 MFA / Additional Factors (Future)

Architecture should leave room to add:

- TOTP-based MFA.
- WebAuthn / Passkeys.
- SMS/Email-based second factor.

These are implemented at the IdP layer, but the auth-core can record:

- `session.mfaLevel` or `authContext.mfaLevel` to gate sensitive actions.

### 8.5 Auditing & Logging

All auth events produce structured audit logs:

- Login success/failure.
- Token creation/rotation.
- Session revocation.
- PAT operations.

`tokens.lastUsedAt` updated on successful use (throttled for performance).  
`sessions.lastUsedAt` can be derived or stored for device management.

---

## 9. Operational & UX Considerations

### 9.1 “Manage Devices” Page

Backed by `/v1/auth/sessions` + `/v1/auth/sessions/:id`:

- Show:
  - Device type, browser, IP (approximate region).
  - Last active time.
- Allow user to:
  - Revoke sessions (log out other devices).

### 9.2 “API Tokens” Page

Backed by `/v1/tokens` endpoints:

- Show:
  - Name, scopes, created at, last used, masked token.
- Allow:
  - Create tokens with scopes.
  - Rename.
  - Revoke.

### 9.3 Incident Response

If token compromise suspected:

- Admin/support can:
  - Revoke:
    - User sessions (kill device logins).
    - Specific PATs.
  - Inspect logs pertaining to a token/user.

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
      // etc.
    }

Auth-core consumes only `VerifiedIdentity`.

Switching providers does not affect:

- Token formats.
- Auth endpoints.
- `AuthContext`.
- PATs, scopes, or sessions.

This ensures that in 2+ years, if you decide to move from Auth.js to Auth0 for enterprise features, the rest of the app continues to function with minimal changes.

---

## 11. Summary

The end-state auth system for SuperBasic Finance should:

- Centralize all token + session logic in a first-party auth-core.
- Use:
  - Short-lived JWT access tokens for all clients.
  - Long-lived, hashed refresh tokens tied to sessions.
  - Scoped, hashed PATs for programmatic access.
- Provide a single, stable `AuthContext` abstraction used throughout the app.
- Support:
  - Web SPA.
  - Capacitor shells.
  - Fully native mobile using OAuth2 + PKCE.
  - CLI / integrations via PATs.
- Be IdP-agnostic, making Auth.js/Auth0/etc. a swappable detail.
- Be ready for:
  - Multi-tenant workspaces.
  - Roles and scopes.
  - MFA and SSO in the future.

This design aims to make auth a one-time heavy lift now, with only incremental, additive changes later rather than large-scale rewrites.

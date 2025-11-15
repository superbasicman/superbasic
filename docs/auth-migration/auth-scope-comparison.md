# Auth Architecture: Plan vs Implementation Comparison

> **Document Purpose:** This document compares the end-state auth architecture defined in `end-auth-goal.md` with the current implementation in the codebase to identify gaps, alignment, and migration priorities.
>
> **Last Updated:** November 14, 2025  
> **Status:** Current implementation is Phase 2.1 (Auth.js migration) - early in the journey toward the full end-auth-goal.md vision

---

## Executive Summary

### Current State
- **IdP:** Auth.js with credentials, Google OAuth, and magic link providers
- **Session Management:** Opaque session tokens (not JWTs) stored in DB with HMAC hashing
- **Access Control:** Basic PATs with scopes, no refresh tokens, no short-lived access tokens
- **Multi-tenancy:** Workspace model exists in DB but auth layer is not workspace-aware
- **Architecture:** Monolithic auth in API server, no separate auth-core package

### Target State (end-auth-goal.md)
- **IdP:** IdP-agnostic with `VerifiedIdentity` and `UserIdentity` linking
- **Tokens:** Short-lived JWTs (asymmetric), refresh tokens with rotation/reuse detection, scoped PATs
- **Auth-Core:** Centralized `packages/auth-core` managing all token/session logic
- **Authorization:** Workspace-aware `AuthContext` with server-side scope derivation
- **Security:** RLS policies, step-up auth, MFA levels, comprehensive audit logging

### Gap Analysis
**Critical Gaps:** Refresh tokens, JWT access tokens, auth-core package, workspace-aware AuthContext, IdP abstraction layer  
**Moderate Gaps:** Key rotation (JWKS), OAuth PKCE flows, session device management UI, incident response tooling  
**Minor Gaps:** Enhanced audit logging, email sync semantics, account deletion flows

---

## 1. High-Level Architecture

### 1.1 IdP Layer

| Aspect | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **IdP Abstraction** | `IdentityProvider` interface, returns `VerifiedIdentity` | Auth.js directly integrated, no abstraction | ❌ Missing | HIGH |
| **Identity Linking** | `UserIdentity` table with `(provider, providerUserId)` | Auth.js `accounts` table exists but not used for linking logic | ⚠️ Partial | HIGH |
| **Email Semantics** | `User.email` as canonical, sync verified emails, handle conflicts | Basic email in `users` table, no sync logic | ❌ Missing | MEDIUM |
| **Supported Providers** | Auth.js (credentials, Google, magic link), future Auth0/SSO | Auth.js with credentials, Google, magic link | ✅ Aligned | - |
| **Provider Namespacing** | `authjs:credentials`, `authjs:google` format | Provider stored as `google`, `credentials` | ⚠️ Partial | LOW |

**Current Implementation:**
```typescript
// packages/auth/src/config.ts - Auth.js directly used
export const authConfig: AuthConfig = {
  providers: [
    Credentials({ /* ... */ }),
    Google({ /* ... */ }),
    Nodemailer({ /* ... */ })
  ],
  // No abstraction layer
}
```

**Gap:** No `IdentityProvider` interface means switching from Auth.js to Auth0 would require extensive refactoring throughout the codebase.

---

### 1.2 Auth-Core Package

| Aspect | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **Package Structure** | Centralized `packages/auth-core` for token/session logic | Logic split between `packages/auth` and `apps/api/src/middleware` | ❌ Missing | HIGH |
| **AuthContext** | Single `AuthContext` type with `userId`, `scopes`, `activeWorkspaceId`, `roles` | Basic `AuthContext` with `userId`, `userEmail`, `authType`, optional `tokenScopes` | ⚠️ Partial | HIGH |
| **Token Management** | Handles JWTs, refresh tokens, PATs | Only handles PATs and opaque session tokens | ⚠️ Partial | CRITICAL |
| **AuthService** | `AuthService.verifyRequest()` for unified auth | Separate `authMiddleware` and `patMiddleware` | ⚠️ Partial | HIGH |

**Current Implementation:**
```typescript
// apps/api/src/types/context.ts
export type AuthContext = {
  Variables: {
    requestId: string;
    userId: string;
    userEmail: string;
    jti?: string; // Session only
    profileId?: string;
    authType?: "session" | "pat";
    tokenId?: string; // PAT only
    tokenScopes?: string[]; // PAT only
  };
};
```

**Gap:** Current `AuthContext` is middleware-focused and missing workspace/role concepts. No centralized auth-core package.

---

## 2. Token Strategy

### 2.1 Access Tokens (JWT)

| Aspect | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **Format** | Short-lived JWT (10-30 min), EdDSA/RS256 | Opaque session tokens (30 days), not JWTs | ❌ Missing | CRITICAL |
| **Signing** | Asymmetric keys (EdDSA/RS256) with `kid` | N/A today – Auth.js encode/decode are overridden so we only issue opaque session token IDs stored in Postgres | ❌ Missing | CRITICAL |
| **Claims** | `sub`, `sid`, `wid`, `aud`, `iss`, `exp`, `jti`, `act`, `token_use` | N/A - not using JWTs for access | ❌ Missing | CRITICAL |
| **Scopes in Token** | NO - scopes derived server-side | PATs have scopes in DB, sessions have none | ✅ Aligned (conceptually) | - |
| **Storage** | In-memory (web), secure storage (mobile) | Opaque tokens in httpOnly cookies | ⚠️ Different approach | - |
| **Verification** | JWT signature + DB checks (user status, session valid) | HMAC hash lookup in `sessions` table | ⚠️ Different approach | - |

**Current Implementation:**
```typescript
// packages/auth/src/config.ts - Auth.js session strategy
session: {
  strategy: 'jwt', // Auth.js internal JWT (not for access tokens)
  maxAge: SESSION_MAX_AGE_SECONDS, // 30 days
},
```

```sql
-- Database: sessions table with opaque tokens
CREATE TABLE "sessions" (
    "id" UUID PRIMARY KEY,
    "user_id" UUID NOT NULL,
    "token_id" UUID NOT NULL UNIQUE,
    "session_token_hash" JSONB NOT NULL, -- HMAC hash envelope
    "expires" TIMESTAMP(3) NOT NULL,
    ...
);
```

**Gap:** The plan calls for short-lived JWTs for all clients, but the current implementation uses long-lived opaque tokens stored in the DB. This is a fundamental architectural difference requiring significant refactoring.

---

### 2.2 Refresh Tokens

| Aspect | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **Existence** | YES - mandatory with rotation | NO - no refresh token mechanism | ❌ Missing | CRITICAL |
| **Format** | Random 256-bit opaque string | N/A | ❌ Missing | CRITICAL |
| **Storage** | SHA-256 hash in `tokens` table | N/A | ❌ Missing | CRITICAL |
| **Rotation** | Mandatory on every use | N/A | ❌ Missing | CRITICAL |
| **Reuse Detection** | Kill entire `familyId` on reuse | N/A | ❌ Missing | HIGH |
| **Family Tracking** | `familyId` links all rotated tokens from one session | N/A | ❌ Missing | CRITICAL |
| **Endpoint** | `POST /v1/auth/refresh` | N/A | ❌ Missing | CRITICAL |

**Gap:** No refresh token implementation at all. This is the most significant gap in the token strategy.

---

### 2.3 Personal Access Tokens (PATs)

| Aspect | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **Format** | `sbf_<43 chars>` | `sbf_<43 chars>` | ✅ Aligned | - |
| **Storage** | SHA-256 hash (optionally with pepper) | HMAC-SHA-256 with salt (via `TokenHashEnvelope`) | ✅ Aligned | - |
| **Scopes** | Mandatory, workspace-bound optional | Scopes in `api_keys.scopes` JSONB | ✅ Aligned | - |
| **Workspace Binding** | `token.workspaceId` field, membership checks | `api_keys.workspace_id` exists, RLS enforces | ✅ Aligned | - |
| **Endpoints** | `POST /v1/tokens`, `GET /v1/tokens`, `DELETE /v1/tokens/:id`, `PATCH /v1/tokens/:id` | `POST /v1/tokens`, `GET /v1/tokens`, `DELETE /v1/tokens/:id`, `PATCH /v1/tokens/:id` | ✅ Aligned | - |
| **User Status Checks** | Reject if `User.status != 'active'` | No `User.status` field in schema | ❌ Missing | MEDIUM |
| **Audit Events** | Emit events for creation, usage, revocation | `authEvents` emitter in place, logs to DB | ✅ Aligned | - |

**Current Implementation:**
```typescript
// packages/auth/src/pat.ts
export function generateToken(): string {
  const randomBytes = crypto.randomBytes(TOKEN_LENGTH);
  return `${PAT_PREFIX}${randomBytes.toString("base64url")}`;
}

export function hashToken(token: string): TokenHashEnvelope {
  return createTokenHashEnvelope(token);
}
```

```sql
-- Database: api_keys table
CREATE TABLE "api_keys" (
    "id" UUID PRIMARY KEY,
    "user_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "workspace_id" UUID, -- Optional workspace binding
    "name" TEXT NOT NULL,
    "key_hash" JSONB NOT NULL, -- HMAC envelope
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "revoked_at" TIMESTAMP(3),
    ...
);
```

**Assessment:** PAT implementation is well-aligned with the plan. Key differences:
- Uses HMAC instead of plain SHA-256 (arguably better)
- Missing `User.status` field to check active users
- `expiresAt` enforcement already matches the plan via `apps/api/src/middleware/pat.ts`, so additional work is not required here

---

### 2.4 Key Management & JWKS

| Aspect | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **Key Storage** | KMS or secret store, never in code | Auth.js `AUTH_SECRET` in env | ⚠️ Partial | HIGH |
| **Key Algorithm** | EdDSA (Ed25519) or RS256 (asymmetric) | N/A – API requests are validated via DB lookups, no asymmetric key pair exists yet | ❌ Missing | CRITICAL |
| **Key Identifier** | `kid` in JWT header | N/A | ❌ Missing | CRITICAL |
| **JWKS Endpoint** | `GET /.well-known/jwks.json` | N/A | ❌ Missing | CRITICAL |
| **Key Rotation** | Regular rotation with overlap period | No rotation mechanism | ❌ Missing | HIGH |

**Current Implementation:**
```typescript
// packages/auth/src/config.ts
const AUTH_SECRET = ensureAuthSecret(process.env.AUTH_SECRET);

export const authConfig: AuthConfig = {
  secret: AUTH_SECRET, // Only used by Auth.js internals; API auth relies on DB-backed opaque tokens
  // No JWKS, no key rotation
};
```

**Gap:** There is no asymmetric signing or JWKS publishing today because API requests are authenticated via DB lookups. To reach the plan we must introduce asymmetric signing keys and expose them via JWKS so mobile/native clients can validate JWTs.

---

## 3. Domain Model & Entities

### 3.1 Core Tables

| Entity | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **User** | `id`, `email`, `status`, profile attrs | `users` table with `id`, `email`, `name`, `password` | ⚠️ Partial (no status) | MEDIUM |
| **UserIdentity** | Links external IdP accounts to User | Auth.js `accounts` table exists | ✅ Exists | - |
| **Session** | `id`, `userId`, `type`, `kind`, `expiresAt`, `absoluteExpiresAt`, `mfaLevel` | `sessions` table with `id`, `userId`, `expires` | ⚠️ Partial | HIGH |
| **Token** | Unified table for refresh + PATs | `api_keys` for PATs only | ⚠️ Partial | CRITICAL |
| **Workspace** | `id`, `ownerProfileId`, `status`, `settings` | `workspaces` table exists | ✅ Aligned | - |
| **WorkspaceMember** | `id`, `workspaceId`, `userId`, `role` | `workspace_members` table exists | ✅ Aligned | - |

**Current Schema:**
```prisma
model User {
  id            String    @id @default(uuid())
  email         String
  password      String?   // No status field
  sessions      Session[]
  apiKeys       ApiKey[]
  // Missing: status, mfaLevel, emailVerified semantics
}

model Session {
  id               String   @id @default(uuid())
  userId           String
  sessionTokenHash Json     // HMAC envelope
  expires          DateTime
  // Missing: type, kind, absoluteExpiresAt, mfaLevel, userAgent, ipAddress
}

model ApiKey { // PATs
  id          String    @id @default(uuid())
  userId      String
  workspaceId String?   // Workspace binding
  scopes      Json
  revokedAt   DateTime?
  // No refresh tokens at all
}
```

**Gaps:**
- No `User.status` field (active/disabled/locked)
- Session table missing: `type`, `kind`, `absoluteExpiresAt`, `mfaLevel`, `lastUsedAt`, `userAgent`, `ipAddress`
- No refresh token storage (separate from sessions)
- No `familyId` concept for token rotation

---

### 3.2 AuthContext

| Aspect | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **userId** | ✅ Present | ✅ Present | ✅ Aligned | - |
| **sessionId** | ✅ Present (null for PATs) | ⚠️ Implicit (via `jti` for sessions) | ⚠️ Partial | MEDIUM |
| **scopes** | Effective scopes for active workspace | Only present for PAT auth (`tokenScopes`) | ❌ Missing | HIGH |
| **activeWorkspaceId** | ✅ With precedence rules (path > header > default) | ❌ Not in context | ❌ Missing | CRITICAL |
| **roles** | Workspace roles (`owner`, `admin`, etc.) | ❌ Not in context | ❌ Missing | HIGH |
| **clientType** | `web \| mobile \| cli \| partner \| other` | ⚠️ Implicit via `authType` (`session` or `pat`) | ⚠️ Partial | MEDIUM |
| **mfaLevel** | `none \| mfa \| phishing_resistant` | ❌ Not tracked | ❌ Missing | LOW |
| **requestId** | For logging/correlation | ✅ Present | ✅ Aligned | - |

**Current Implementation:**
```typescript
// apps/api/src/types/context.ts
export type AuthContext = {
  Variables: {
    requestId: string;
    userId: string;
    userEmail: string;
    jti?: string; // Session JWT ID
    profileId?: string;
    authType?: "session" | "pat";
    tokenId?: string; // PAT ID
    tokenScopes?: string[]; // Only for PATs
    // Missing: activeWorkspaceId, roles, clientType, mfaLevel
  };
};
```

**Gap:** AuthContext is not workspace-aware. Scopes are only present for PAT auth, not for session-based requests.

---

## 4. Authorization Model

### 4.1 Scopes

| Aspect | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **Scope Format** | `read:transactions`, `write:budgets`, etc. | Same format in `packages/types/src/scopes.ts` | ✅ Aligned | - |
| **Scope Storage** | NOT in tokens - derived server-side | PATs have scopes in DB, sessions have none | ⚠️ Partial | HIGH |
| **Scope Resolution** | From workspace membership + role mapping | No automatic resolution | ❌ Missing | HIGH |
| **Workspace Scoping** | Scopes are workspace-specific | No workspace context in scope checks | ❌ Missing | CRITICAL |
| **Global Scopes** | `read:profile`, `write:profile` | Defined but not differentiated | ⚠️ Partial | LOW |

**Current Implementation:**
```typescript
// packages/types/src/scopes.ts
export const VALID_SCOPES = [
  'read:transactions',
  'write:transactions',
  'read:budgets',
  'write:budgets',
  'read:accounts',
  'write:accounts',
  'read:profile',
  'write:profile',
  'read:workspaces',
  'write:workspaces',
  'admin',
] as const;
```

```typescript
// apps/api/src/middleware/scopes.ts
export function requireScope(requiredScope: Scope) {
  return async (c: Context, next: Next) => {
    const tokenScopes = c.get('tokenScopes'); // Only for PATs
    if (!tokenScopes || !hasScope(tokenScopes, requiredScope)) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    await next();
  };
}
```

**Gap:** Scope checking only works for PAT requests. Session-based requests have no scope enforcement. No workspace-aware scope derivation.

---

### 4.2 Roles & RBAC

| Aspect | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **Role Definition** | `owner`, `admin`, `member`, `viewer` | Same roles in `workspace_members.role` | ✅ Aligned | - |
| **Role-to-Scope Mapping** | Central mapping in auth-core | Basic mapping in `packages/auth/src/rbac.ts` | ⚠️ Partial | MEDIUM |
| **AuthzService** | `requireScope()`, `requireRole()` helpers | `requireScope()` exists, no `requireRole()` | ⚠️ Partial | MEDIUM |
| **Workspace Context** | Roles apply per workspace | Roles stored in `workspace_members` | ✅ Aligned | - |

**Current Implementation:**
```typescript
// packages/auth/src/rbac.ts
export const RBAC_ROLES = {
  owner: Object.keys(RBAC_SCOPES) as RBACScope[],
  admin: [
    'account:read',
    'workspace:write',
    'transactions:write',
    // ...
  ] as RBACScope[],
  member: ['account:read', 'transactions:read'] as RBACScope[],
  readonly: ['account:read', 'transactions:read'] as RBACScope[],
} as const;
```

**Gap:** Role definitions exist but are not integrated into the auth middleware. No automatic role → scope resolution in `AuthContext`.

---

### 4.3 Multi-Tenancy

| Aspect | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **Workspace Table** | ✅ Required | ✅ Exists | ✅ Aligned | - |
| **WorkspaceMember Table** | ✅ Required | ✅ Exists | ✅ Aligned | - |
| **Active Workspace Resolution** | Path param > header > default | ❌ No middleware | ❌ Missing | CRITICAL |
| **RLS Policies** | Enforce workspace boundaries | ✅ Extensive RLS policies | ✅ Aligned | - |
| **Postgres GUCs** | Set `app.workspace_id` per request | ❌ Not set (API never writes `app.*` settings) | ❌ Missing | CRITICAL |

**Current Implementation:**
```sql
-- RLS policies exist and enforce workspace boundaries
CREATE POLICY connections_rw ON connections
  USING (
    current_setting('app.profile_id', true) IS NOT NULL
    AND (
      owner_profile_id = current_setting('app.profile_id', true)::uuid
      OR (
        current_setting('app.workspace_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM workspace_members wm
          WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
    )
  );
```

**Gap:** RLS policies expect `app.workspace_id`/`app.profile_id` to be set, but the API never assigns those Postgres session variables, so policies cannot currently enforce tenant boundaries for application traffic.

---

## 5. API Endpoints

### 5.1 Auth Core Endpoints

| Endpoint | Auth Plan | Current Implementation | Status | Priority |
|----------|-----------|----------------------|--------|----------|
| **GET /v1/auth/session** | Returns full session info with workspace context | Auth.js `GET /v1/auth/session` (minimal) | ⚠️ Partial | HIGH |
| **POST /v1/auth/token** | Exchange login proof for access+refresh tokens | ❌ N/A | ❌ Missing | CRITICAL |
| **POST /v1/auth/refresh** | Rotate refresh token | ❌ N/A | ❌ Missing | CRITICAL |
| **POST /v1/auth/logout** | Revoke session + refresh tokens | Auth.js `POST /v1/auth/signout` | ⚠️ Partial | MEDIUM |
| **GET /v1/auth/sessions** | List user's active sessions/devices | ❌ N/A | ❌ Missing | LOW |
| **DELETE /v1/auth/sessions/:id** | Revoke specific session | ❌ N/A | ❌ Missing | LOW |
| **GET /v1/auth/jwks.json** | Publish public keys for JWT verification | ❌ N/A | ❌ Missing | CRITICAL |

**Current Implementation:**
```typescript
// apps/api/src/auth.ts - Delegates to Auth.js
authApp.all("/*", async (c) => {
  const authResponse = await Auth(request, authConfig);
  // Auth.js handles /session, /signout, /callback/*, etc.
});
```

**Gap:** Missing token exchange, refresh, and JWKS endpoints. Session management is minimal.

---

### 5.2 OAuth Endpoints (for PKCE)

| Endpoint | Auth Plan | Current Implementation | Status | Priority |
|----------|-----------|----------------------|--------|----------|
| **GET /v1/oauth/authorize** | Standard OAuth with PKCE | ❌ N/A | ❌ Missing | HIGH (for mobile) |
| **POST /v1/oauth/token** | Exchange code for tokens | ❌ N/A | ❌ Missing | HIGH (for mobile) |

**Gap:** No OAuth PKCE flow for native mobile apps. Current implementation only supports browser-based OAuth.

---

### 5.3 PAT Management Endpoints

| Endpoint | Auth Plan | Current Implementation | Status | Priority |
|----------|-----------|----------------------|--------|----------|
| **POST /v1/tokens** | Create PAT | ✅ Implemented | ✅ Aligned | - |
| **GET /v1/tokens** | List PATs | ✅ Implemented | ✅ Aligned | - |
| **DELETE /v1/tokens/:id** | Revoke PAT | ✅ Implemented | ✅ Aligned | - |
| **PATCH /v1/tokens/:id** | Rename PAT | ✅ Implemented | ✅ Aligned | - |

**Current Implementation:**
```typescript
// apps/api/src/routes/v1/tokens/index.ts
export const tokensRoutes = new Hono<AuthContext>()
  .post('/', createToken)
  .get('/', listTokens)
  .delete('/:id', revokeToken)
  .patch('/:id', updateToken);
```

**Assessment:** PAT management endpoints are fully implemented and aligned with the plan.

---

## 6. Security Controls

### 6.1 Token Storage & Hashing

| Aspect | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **PAT Hashing** | SHA-256 + optional pepper | HMAC-SHA-256 with salt (stronger) | ✅ Better than plan | - |
| **Refresh Token Hashing** | SHA-256 + optional pepper | N/A (no refresh tokens) | ❌ Missing | CRITICAL |
| **Session Token Hashing** | Plan uses JWTs (no DB storage) | HMAC-SHA-256 with salt | ⚠️ Different approach | - |
| **Token Prefixes** | `sbf_` for PATs | `sbf_` for PATs | ✅ Aligned | - |
| **Masked Tokens** | Show last 4 chars in UI | `api_keys.last4` field | ✅ Aligned | - |

**Current Implementation:**
```typescript
// packages/auth/src/token-hash.ts
export function createTokenHashEnvelope(token: string): TokenHashEnvelope {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .createHmac('sha256', getSecretKey())
    .update(`${salt}:${token}`)
    .digest('hex');

  return {
    algorithm: 'hmac-sha256',
    hash,
    salt,
  };
}
```

**Assessment:** Current hashing is arguably stronger than the plan (HMAC vs plain SHA-256).

---

### 6.2 Cookie Configuration

| Aspect | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **HttpOnly** | ✅ Required | ✅ Implemented | ✅ Aligned | - |
| **Secure** | ✅ In production | ✅ In production | ✅ Aligned | - |
| **SameSite** | `Lax` or `Strict` | `Lax` | ✅ Aligned | - |
| **Cross-subdomain** | Support via `Domain` setting | ✅ Configured | ✅ Aligned | - |
| **CSRF Protection** | Required for cookie-based endpoints | `SameSite=Lax` provides basic protection | ⚠️ Partial | MEDIUM |

**Current Implementation:**
```typescript
// packages/auth/src/config.ts
cookies: {
  sessionToken: {
    name: 'authjs.session-token',
    options: {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PRODUCTION,
      domain: IS_PRODUCTION ? '.superbasicfinance.com' : undefined,
    },
  },
},
```

**Gap:** No explicit CSRF token mechanism for sensitive mutations beyond `SameSite`.

---

### 6.3 Rate Limiting

| Aspect | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **Login Rate Limit** | Per-IP and per-user | ✅ Per-IP implemented | ⚠️ Partial | MEDIUM |
| **Token Refresh Rate Limit** | Required | N/A (no refresh tokens) | ❌ Missing | CRITICAL |
| **PAT Creation Rate Limit** | Required | ✅ Implemented | ✅ Aligned | - |
| **Brute Force Protection** | Account lockout + captcha | Failed auth tracking exists | ⚠️ Partial | MEDIUM |

**Current Implementation:**
```typescript
// apps/api/src/middleware/rate-limit/
- credentials-rate-limit.ts
- magic-link-rate-limit.ts
- token-rate-limit.ts
- failed-auth-tracking.ts
```

**Gap:** Rate limiting is partially implemented but needs expansion for refresh token endpoint.

---

### 6.4 Audit Logging

| Aspect | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **Auth Events** | Login, logout, token ops, reuse detection | ✅ `authEvents` emitter | ✅ Aligned | - |
| **Structured Logs** | Pino with correlation IDs | ✅ Pino logger with `requestId` | ✅ Aligned | - |
| **Sensitive Data** | Never log full tokens, careful with IP/UA | ✅ Masked tokens, truncated IPs | ✅ Aligned | - |
| **Token Reuse Detection** | High-severity logs | N/A (no refresh tokens) | ❌ Missing | CRITICAL |

**Current Implementation:**
```typescript
// packages/auth/src/events.ts
export const authEvents = {
  emit(event: AuthEvent) {
    // Emit to logger/audit system
  }
};

// Events: token_created, token_used, token_revoked, token_auth_failed
```

**Assessment:** Event infrastructure is in place but missing critical events (refresh reuse, session revocation).

---

## 7. Client Support

### 7.1 Web SPA

| Aspect | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **Login Flow** | IdP auth → access+refresh tokens | Auth.js credentials/OAuth → session cookie | ⚠️ Different approach | - |
| **Token Storage** | In-memory or httpOnly cookie (BFF) | httpOnly cookie (Auth.js) | ✅ Aligned | - |
| **Token Refresh** | `POST /v1/auth/refresh` | N/A (long-lived session) | ❌ Missing | CRITICAL |
| **API Calls** | `Authorization: Bearer <jwt>` | Session cookie auto-sent | ⚠️ Different approach | - |

**Current Implementation:**
```typescript
// apps/web/src/contexts/AuthContext.tsx
async function login(credentials: LoginInput): Promise<void> {
  const { user } = await authApi.login(credentials);
  setUser(user);
  // Uses httpOnly cookie, no explicit token management
}
```

**Gap:** No access token / refresh token flow. Current implementation uses long-lived opaque session tokens.

---

### 7.2 Mobile (Capacitor & Native)

| Aspect | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **Capacitor** | Reuse web flow with secure storage | ❌ Not tested | ⚠️ Unknown | MEDIUM |
| **Native (PKCE)** | OAuth Authorization Code + PKCE | ❌ Not implemented | ❌ Missing | HIGH |
| **Token Storage** | Keychain/Keystore | N/A | ❌ Missing | HIGH |
| **Deep Links** | `superbasic://callback` for OAuth | N/A | ❌ Missing | HIGH |

**Gap:** No mobile-specific auth flows. Current implementation is web-only.

---

### 7.3 CLI & Automation

| Aspect | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **PAT Support** | ✅ Primary method | ✅ Implemented | ✅ Aligned | - |
| **PAT Creation** | Via web UI or API | ✅ Both | ✅ Aligned | - |
| **PAT Usage** | `Authorization: Bearer sbf_*` | ✅ Implemented | ✅ Aligned | - |

**Assessment:** CLI/automation support via PATs is fully aligned with the plan.

---

## 8. Migration & Operations

### 8.1 IdP Migration Path (Auth.js → Auth0)

| Aspect | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **Abstraction Layer** | `IdentityProvider` interface | ❌ Auth.js tightly coupled | ❌ Missing | HIGH |
| **Identity Linking** | `UserIdentity` table | Auth.js `accounts` table | ⚠️ Partial | MEDIUM |
| **Provider Namespacing** | `authjs:google`, `auth0:google` | `google`, `credentials` | ⚠️ Partial | LOW |
| **Migration Strategy** | Gradual cutover with link-on-login | N/A | ❌ Missing | LOW (future) |

**Gap:** No clean abstraction layer means migrating to Auth0 would require significant refactoring.

---

### 8.2 Session Management UI

| Aspect | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **"Manage Devices" Page** | List active sessions with device info | ❌ Not implemented | ❌ Missing | LOW |
| **Remote Logout** | Revoke specific session | ❌ Not implemented | ❌ Missing | LOW |
| **Session Metadata** | Device, IP, last active, created | Minimal in DB | ⚠️ Partial | MEDIUM |

**Gap:** No user-facing session management UI.

---

### 8.3 Incident Response

| Aspect | Auth Plan | Current Implementation | Status | Priority |
|--------|-----------|----------------------|--------|----------|
| **Token Revocation** | Admin can revoke sessions, PATs, refresh tokens | PAT revocation works | ⚠️ Partial | MEDIUM |
| **"Log out all devices"** | Single operation to kill all user sessions | ❌ Not implemented | ❌ Missing | LOW |
| **Reuse Detection Alerts** | High-severity logs for token reuse | N/A (no refresh tokens) | ❌ Missing | CRITICAL |
| **Admin Tooling** | Internal API for support | ❌ Not implemented | ❌ Missing | LOW |

**Gap:** Limited incident response capabilities beyond manual DB operations.

---

## 9. Critical Path Forward

### Phase 1: Foundation (Next 2-4 weeks)
**Goal:** Establish auth-core package and workspace-aware AuthContext

1. ⬜ **CRITICAL:** Create `packages/auth-core` package _(Not started)_
   - Move token/session logic from `apps/api/src/middleware`
   - Define `AuthContext` interface with workspace/role fields
   - Define `AuthService.verifyRequest()` interface

2. ⬜ **CRITICAL:** Add `User.status` field to schema _(Not started)_
   - Migration: `ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'`
   - Update auth middleware to check `User.status`

3. ⬜ **CRITICAL:** Implement workspace-aware auth middleware _(Not started)_
   - Extract `activeWorkspaceId` from path params / headers / default
   - Resolve workspace membership and roles
   - Set Postgres GUCs (`app.workspace_id`, `app.profile_id`) on every request

4. ⬜ **HIGH:** Enhance `AuthContext` with workspace fields _(Not started)_
   - Add `activeWorkspaceId`, `roles`, `scopes` (computed from membership)
   - Update middleware to populate these fields

---

### Phase 2: Refresh Tokens (4-6 weeks)
**Goal:** Add refresh token rotation with reuse detection

1. ⬜ **CRITICAL:** Design refresh token schema _(Not started)_
   ```sql
   CREATE TABLE refresh_tokens (
     id UUID PRIMARY KEY,
     user_id UUID NOT NULL,
     session_id UUID NOT NULL,
     token_hash TEXT NOT NULL, -- SHA-256
     family_id UUID NOT NULL, -- For rotation tracking
     expires_at TIMESTAMPTZ NOT NULL,
     revoked_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (family_id) WHERE revoked_at IS NULL -- One active token per family
   );
   ```

2. ⬜ **CRITICAL:** Implement `POST /v1/auth/refresh` _(Not started)_
   - Token rotation: revoke old, issue new
   - Reuse detection: kill entire `familyId` on reuse
   - Update `Session.lastUsedAt` and sliding expiration

3. ⬜ **CRITICAL:** Update session creation _(Not started)_
   - Issue refresh token alongside session cookie
   - Link refresh token to session via `session_id`

4. ⬜ **HIGH:** Add `Session` metadata fields _(Not started)_
   - Migration: Add `type`, `kind`, `absoluteExpiresAt`, `lastUsedAt`, `userAgent`, `ipAddress`, `mfaLevel`

---

### Phase 3: JWT Access Tokens (6-8 weeks)
**Goal:** Replace opaque session tokens with short-lived JWTs

1. ⬜ **CRITICAL:** Generate asymmetric key pair _(Not started)_
   - Use EdDSA (Ed25519) or RS256
   - Store private key in KMS/secrets
   - Generate `kid` identifier

2. ⬜ **CRITICAL:** Implement JWKS endpoint _(Not started)_
   - `GET /.well-known/jwks.json`
   - Publish public key with `kid`

3. ⬜ **CRITICAL:** Update session creation _(Not started)_
   - Issue JWT access token (10-30 min TTL)
   - Include claims: `sub`, `sid`, `wid`, `aud`, `iss`, `exp`, `jti`, `act`
   - Do NOT include scopes in JWT

4. ⬜ **CRITICAL:** Update auth middleware _(Not started)_
   - Verify JWT signature using public key
   - Extract `userId`, `sessionId` from token
   - Look up session in DB, check expiry and `User.status`
   - Resolve workspace membership and scopes (not from JWT)

5. ⬜ **HIGH:** Update web client _(Not started)_
   - Store access token in memory
   - Add `Authorization: Bearer <jwt>` to requests
   - Call `/v1/auth/refresh` when access token expires

---

### Phase 4: IdP Abstraction (4-6 weeks)
**Goal:** Decouple from Auth.js for future IdP swaps

1. ⬜ **HIGH:** Define `IdentityProvider` interface _(Not started)_
   ```typescript
   interface IdentityProvider {
     authenticateWithCredentials(email: string, password: string): Promise<VerifiedIdentity>;
     initiateOAuth(provider: 'google' | 'apple'): RedirectUrl;
     handleOAuthCallback(query: URLSearchParams): Promise<VerifiedIdentity>;
     sendMagicLink(email: string): Promise<void>;
     verifyMagicLink(token: string): Promise<VerifiedIdentity>;
   }

   type VerifiedIdentity = {
     provider: string;
     providerUserId: string;
     email: string | null;
     emailVerified?: boolean;
     name?: string;
     picture?: string;
   };
   ```

2. ⬜ **HIGH:** Implement Auth.js adapter _(Not started)_
   - Wrap existing Auth.js logic in `IdentityProvider` interface
   - Update provider naming: `authjs:credentials`, `authjs:google`

3. ⬜ **MEDIUM:** Implement identity linking logic _(Not started)_
   - Look up by `(provider, providerUserId)` first
   - Fall back to verified email matching
   - Create `User` + `UserIdentity` for new users

4. ⬜ **MEDIUM:** Update `accounts` table semantics _(Not started)_
   - Treat as `UserIdentity` (rename or add layer)
   - Add provider namespacing

---

### Phase 5: Mobile Support (6-8 weeks)
**Goal:** Enable native mobile apps with OAuth PKCE

1. ⬜ **HIGH:** Implement OAuth Authorization Code flow _(Not started)_
   - `GET /v1/oauth/authorize` with PKCE support
   - Store authorization codes (short-lived, single-use)

2. ⬜ **HIGH:** Implement `POST /v1/oauth/token` _(Not started)_
   - Exchange code for access+refresh tokens
   - Verify PKCE `code_verifier`

3. ⬜ **HIGH:** Register OAuth client _(Not started)_
   - Add `OAuthClient` table (or hardcode `mobile` client)
   - Validate `redirect_uri` (e.g., `superbasic://callback`)

4. ⬜ **MEDIUM:** Test with native mobile app _(Not started)_
   - Use system browser for login
   - Capture authorization code via deep link
   - Exchange for tokens

---

### Phase 6: Polish & Hardening (Ongoing)
**Goal:** Production-ready security and operations

1. ⬜ **HIGH:** Implement key rotation _(Not started)_
   - Generate new key pair
   - Publish both keys in JWKS during overlap period
   - Rotate on schedule (60-90 days)

2. ⬜ **MEDIUM:** Add "Manage Devices" UI _(Not started)_
   - List active sessions with metadata
   - Remote logout functionality

3. ⬜ **MEDIUM:** Enhance audit logging _(Not started)_
   - Token reuse detection alerts
   - Session revocation events
   - Account deletion events

4. ⬜ **LOW:** Add step-up auth for sensitive actions _(Not started)_
   - Re-authenticate for bank linking, password changes
   - Issue short-lived tokens with higher `mfaLevel`

5. ⬜ **LOW:** Build admin incident response tooling _(Not started)_
   - Revoke all sessions for a user
   - Inspect token families
   - View security events

---

## 10. Risk Assessment

### High-Risk Gaps (Block Production)
1. **No Refresh Tokens** - Long-lived session tokens increase attack surface
2. **No JWT Access Tokens** - Can't support stateless mobile clients
3. **No JWKS** - Can't distribute public keys for native apps
4. **Missing Workspace Context** - AuthContext not workspace-aware

### Medium-Risk Gaps (Limit Scalability)
1. **No IdP Abstraction** - Vendor lock-in to Auth.js
2. **No OAuth PKCE** - Can't support secure native mobile apps
3. **No Session Management UI** - Users can't revoke compromised devices
4. **Limited Audit Logging** - Hard to detect/respond to incidents

### Low-Risk Gaps (Polish & UX)
1. **No Key Rotation** - Manual key management
2. **No Step-Up Auth** - All actions have same security level
3. **No MFA Tracking** - Can't gate sensitive actions by MFA status
4. **No Admin Tooling** - Support relies on manual DB ops

---

## 11. Recommendations

### Immediate Actions (This Sprint)
1. Add `User.status` field to schema
2. Implement workspace-aware auth middleware (extract `activeWorkspaceId`, set GUCs)
3. Create `packages/auth-core` package (stub out interfaces)

### Short-Term (Next 4-6 weeks)
1. Design and implement refresh token schema
2. Build `POST /v1/auth/refresh` with rotation and reuse detection
3. Enhance `Session` table with metadata fields

### Medium-Term (Next 3-6 months)
1. Replace opaque session tokens with JWT access tokens
2. Implement JWKS endpoint and key management
3. Build IdP abstraction layer
4. Add OAuth PKCE support for mobile

### Long-Term (6-12 months)
1. Build "Manage Devices" UI
2. Implement step-up auth for sensitive actions
3. Add MFA support and tracking
4. Build admin incident response tooling
5. Consider Auth0 migration (if needed)

---

## 12. Alignment Scorecard

| Category | Plan Coverage | Implementation Status | Score | Priority |
|----------|--------------|----------------------|-------|----------|
| **IdP Layer** | Comprehensive | Basic Auth.js integration | 40% | HIGH |
| **Token Strategy** | Comprehensive | PATs only, no refresh/JWT | 30% | CRITICAL |
| **Auth-Core Package** | Central requirement | Split across packages | 20% | HIGH |
| **AuthContext** | Workspace-aware, rich | Basic user/profile only | 40% | CRITICAL |
| **Authorization** | Scope + role model | Scopes exist, no integration | 50% | HIGH |
| **Multi-Tenancy** | Workspace-first | DB ready, auth not aware | 60% | CRITICAL |
| **API Endpoints** | Comprehensive | PAT mgmt only | 40% | HIGH |
| **Security Controls** | Comprehensive | Basic rate limit + hashing | 60% | MEDIUM |
| **Client Support** | Web + mobile + CLI | Web + CLI only | 60% | MEDIUM |
| **Operations** | Full management UI | Limited tooling | 30% | LOW |

**Overall Alignment: 42%**

---

## Appendix A: Schema Comparison

### Missing Tables
- `refresh_tokens` (critical)
- `oauth_clients` (for PKCE)

### Missing Columns
- `users.status` (active/disabled/locked)
- `sessions.type` (web/mobile/cli)
- `sessions.kind` (persistent/short)
- `sessions.absoluteExpiresAt`
- `sessions.lastUsedAt`
- `sessions.userAgent`
- `sessions.ipAddress`
- `sessions.mfaLevel`

### Naming Mismatches
- `api_keys` should conceptually be `tokens` (includes PATs and future refresh tokens)
- `accounts` is effectively `user_identities`

---

## Appendix B: Code Organization Comparison

### Current Structure
```
packages/auth/          # Auth.js config, PAT utils, RBAC
apps/api/src/middleware/ # Auth middleware, PAT middleware
apps/api/src/routes/v1/tokens/ # PAT CRUD
apps/api/src/auth.ts    # Auth.js handler
```

### Target Structure (per plan)
```
packages/auth-core/     # ALL token/session/auth logic
  - tokens/             # JWT, refresh, PAT generation/validation
  - identity/           # IdP abstraction
  - authz/              # Scope resolution, AuthContext
  - session/            # Session management
apps/api/src/middleware/auth.ts # Thin wrapper calling auth-core
apps/api/src/routes/v1/auth/    # Auth endpoints (refresh, logout, etc.)
apps/api/src/routes/v1/tokens/  # PAT CRUD (delegates to auth-core)
```

---

## Document Changelog

- **2025-11-14:** Initial comprehensive comparison created
- **Future:** Update quarterly or after major auth changes

---

**End of Comparison Document**

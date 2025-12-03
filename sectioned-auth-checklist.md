# Sectioned Auth Checklist

This document breaks down the `end-auth-goal.md` into a checklist to track alignment.

---

## 0. THREAT MODEL & NON-GOALS

### 0.1 Threat Model
- [ ] 1. Protection against stolen bearer credentials (compromised access tokens, refresh tokens/PATs).
- [ ] 2. Protection against compromised user accounts (password reuse, phishing, reused social accounts, malicious reuse of revoked tokens).
- [ ] 3. Protection against tenant isolation failures (cross-tenant data leaks, misconfigured RLS).
- [ ] 4. Protection against malicious clients (abusing OAuth, misusing PATs).
- [ ] 5. Protection against insider misuse (admin/service access without need).
- [ ] 6. Assumption: Transport security (TLS) is in place for all external traffic.
- [ ] 7. Assumption: Underlying infrastructure (KMS, secret storage) is secure.

### 0.2 Non-goals (Initially)
- [ ] 1. No fine-grained, attribute-based access control (ABAC) beyond roles + scopes.
- [ ] 2. No delegated user impersonation/"login as user" for support.
- [ ] 3. No generic policy engine (e.g., OPA) integrated into runtime.
- [ ] 4. No cross-tenant resource sharing beyond a simple "shared workspace" concept.
- [ ] 5. No complex OAuth2/OIDC flows (device code, back-channel logout, etc.) beyond first-party needs.

---

## 1. HIGH-LEVEL ARCHITECTURE

### 1.1 Components
- [ ] 1. IdP(s): Supports external (Google) and a first-party IdP (email/password, magic-link).
- [ ] 2. Auth-Core: Normalizes identities into `VerifiedIdentity`.
- [ ] 3. Auth-Core: Issues and validates Sessions, Access Tokens (JWT), Refresh Tokens (opaque), and PATs.
- [ ] 4. Auth-Core: Maintains Users, Workspaces, Memberships, and Service Identities.
- [ ] 5. Auth-Core: Exposes OAuth 2.1 and OIDC endpoints.
- [ ] 6. Application API: Receives tokens/cookies, validates them with auth-core.
- [ ] 7. Application API: Constructs `AuthContext` for business logic.
- [ ] 8. Application API: Uses Postgres RLS with GUCs for data isolation.

### 1.2 Logical Flow
- [ ] 1. User signs in via a supported IdP.
- [ ] 2. Auth-core maps IdP identity to a local User.
- [ ] 3. Auth-core creates a Session.
- [ ] 4. Auth-core issues a short-lived access token (JWT) and a refresh token (opaque).
- [ ] 5. Frontend stores access token in memory and refresh token in an HTTP-only cookie (for web).
- [ ] 6. Mobile/CLI stores tokens securely in the OS keychain.
- [ ] 7. API requests include `Authorization: Bearer <access_token>` or use a session cookie.
- [ ] 8. API/gateway validates the token to resolve Session, User, Workspace, Roles, Scopes, and MFA level.
- [ ] 9. API constructs `AuthContext` and sets Postgres GUCs (`app.user_id`, `app.workspace_id`, etc.).
- [ ] 10. RLS policies enforce per-tenant access at the database layer.

---

## 2. DATA MODEL & CORE CONCEPTS

### 2.1 Users and Identities
- [ ] 1. `users` table exists with core fields (`id`, `created_at`, `primary_email`, `user_state`, etc.).
- [ ] 2. Email is unique among active users.
- [ ] 3. Deleted users' emails can be reused after a cooling-off period.
- [ ] 4. `user_identities` table links users to IdP identities (`user_id`, `provider`, `provider_subject`).
- [ ] 5. The combination of `(provider, provider_subject)` is unique in `user_identities`.
- [ ] 6. A `VerifiedIdentity` abstraction is used to decouple IdP specifics.

### 2.2 AuthContext
- [ ] 1. An `AuthContext` is produced by auth middleware for all downstream services.
- [ ] 2. `AuthContext` contains `principalType` ('anonymous', 'user', 'service').
- [ ] 3. `AuthContext` contains shared fields like `authTime`, `sessionId`, `tokenId`, `clientId`, `scopes`.
- [ ] 4. `AuthContext` contains user-specific fields like `userId`, `workspaceId`, `roles`, `mfaLevel`.
- [ ] 5. `AuthContext` contains service-specific fields like `serviceId`, `serviceType`.
- [ ] 6. Scopes and roles are distinct: scopes define token permissions, roles are mapped to scopes.
- [ ] 7. Effective permissions are an intersection of token scopes, workspace roles, and RLS policies.

### 2.3 Workspaces & Memberships
- [ ] 1. `workspaces` table exists to serve as a tenant boundary (`id`, `name`, `workspace_type`).
- [ ] 2. `workspace_memberships` table links users to workspaces (`workspace_id`, `user_id`, `role`).
- [ ] 3. The combination of `(workspace_id, user_id)` is unique for active memberships.

---

## 3. TOKENS, SESSIONS, AND KEYS

### 3.1 Token Taxonomy
- [ ] 1. Access Tokens: Short-lived JWTs for APIs.
- [ ] 2. Refresh Tokens: Long-lived, opaque, rotated, with reuse detection.
- [ ] 3. Personal Access Tokens (PATs): Opaque, workspace/user-scoped for CLI/automation (available in v1).
- [ ] 4. Service Credentials: OAuth client_id/secret for service-to-service auth.
- [ ] 5. Email/Verification Tokens: Opaque, short-lived for email flows.

### 3.2 Canonical Token Format & Hash Envelopes
- [ ] 1. Opaque tokens follow the format `<prefix>_<tokenId>.<secret>`.
- [ ] 2. `tokenId` is parsed from the token string for DB lookup.
- [ ] 3. Raw secrets are never stored; a hash envelope is stored instead.
- [ ] 4. Hash envelope contains `hash`, `salt`, `key_id`, and `hmac_algo`.
- [ ] 5. `key_id` allows for gradual rotation of HMAC/KMS keys.
- [ ] 6. Provider credentials that must be reused are encrypted (not just hashed).

### 3.3 Sessions and Refresh Tokens
- [ ] 1. `auth_sessions` table represents a logical login (`id`, `user_id`, `mfa_level`, etc.).
- [ ] 2. `refresh_tokens` table stores opaque refresh tokens (`id`, `session_id`, `family_id`, `hash_envelope`).
- [ ] 3. Each session has one current refresh token. All tokens for a session share a `family_id`.
- [ ] 4. On refresh, a new token is created, and the old one is revoked (rotation).
- [ ] 5. V1 handles the first incident of reuse in a short window as a benign race condition (logs, returns 401, no family revocation).
- [ ] 6. Future: More nuanced reuse detection will revoke the token family and notify the user.

### 3.4 Personal Access Tokens (PATs) / API Keys
- [ ] 1. PATs use the canonical opaque format and are stored as hash envelopes.
- [ ] 2. PATs are bound to a `user_id` and an optional `workspace_id`.
- [ ] 3. PAT creation, listing, and revocation are available in v1/MVP.
- [ ] 4. PATs have a maximum lifetime (e.g., 90 days), no "never expires" option.
- [ ] 5. PATs are sent as `Authorization: Bearer <pat>`.

### 3.5 Access Tokens (JWTs)
- [ ] 1. JWTs are short-lived and contain minimal claims (`sub`, `iss`, `aud`, `exp`, `iat`, `sid`, `scp`).
- [ ] 2. `sub` is `users.id` for user tokens and `service_identities.id` for service principals.
- [ ] 3. V1: PATs are treated as primary credentials, not exchanged for JWTs.
- [ ] 4. JWT scopes are hints; true permissions come from stored metadata, roles, and RLS.
- [ ] 5. Revocation relies primarily on short TTLs.

### 3.6 OIDC id_tokens
- [ ] 1. `id_tokens` are JWTs representing identity in OIDC flows with standard claims.
- [ ] 2. `sub` claim uses public identifiers for first-party clients.
- [ ] 3. `sub` claim will use pairwise identifiers for third-party clients (post-v1).
- [ ] 4. A mapping table from `(user_id, client_id)` to `pairwise_sub` is planned.

### 3.7 Default Security Parameters
- [ ] 1. Access Token TTL: ~10 minutes.
- [ ] 2. Refresh Token TTL: ~30 days, with a shorter idle timeout (~14 days).
- [ ] 3. Session TTL: ~30 days, with a shorter idle timeout (~14 days).
- [ ] 4. PAT TTL: 30-90 days, no non-expiring keys.
- [ ] 5. High-risk actions require MFA.

---

## 4. CORE INVARIANTS

- [ ] 1. A single canonical user ID (`users.id`) is used.
- [ ] 2. All auth decisions flow through the `AuthContext`.
- [ ] 3. JWT access tokens are short-lived and not the sole source of authorization.
- [ ] 4. Opaque tokens (refresh, PATs) are stored using hash envelopes.
- [ ] 5. Workspace is the core unit of data isolation, enforced by RLS.
- [ ] 6. Postgres GUCs (`app.workspace_id`) are set for each request.
- [ ] 7. An action is allowed only if the token is valid, `AuthContext` is appropriate, roles/scopes permit it, and RLS constraints are met.

---

## 5. IMPLEMENTATION DETAILS

### 5.1 Transport & Storage
- [ ] 1. All external endpoints use HTTPS.
- [ ] 2. Secrets are never logged.
- [ ] 3. Hash envelopes and encryption keys are managed via KMS/HSM.

### 5.2 Client Platforms
- [ ] 1. Web: Access token in memory, refresh token in `HttpOnly` cookie.
- [ ] 2. Web: CSRF protection is used for state-mutating, cookie-based flows.
- [ ] 3. Web: OIDC auth code flow with PKCE is used for sign-in.
- [ ] 4. Mobile/Capacitor: Tokens stored in secure OS storage (Keychain/Keystore).
- [ ] 5. CLI/Automation: PATs are the preferred method.
- [ ] 6. Service-to-service: OAuth 2.1 client credentials grant is used.

### 5.3 Session UX and Flows
- [ ] 1. Sign-in flow normalizes various IdP inputs into a `VerifiedIdentity`.
- [ ] 2. Auth-core creates a Session and issues tokens upon successful sign-in.
- [ ] 3. Sign-out revokes auth-core sessions/tokens.
- [ ] 4. "Remember me" functionality adjusts session TTL.

### 5.4 Multi-tenant Workspace Selection
- [ ] 1. Workspace is selected via `X-Workspace-Id` header or a default.
- [ ] 2. The backend resolves the workspace and sets `current_setting('app.workspace_id')`.
- [ ] 3. Client SDKs handle workspace header plumbing automatically.
- [ ] 4. For user-scoped PATs with multiple workspaces, an explicit header is required.

### 5.5 Service Identities
- [ ] 1. `service_identities` table defines service principals (`id`, `name`, `service_type`).
- [ ] 2. `client_secrets` are stored hashed using the same envelope pattern.
- [ ] 3. A 1:1 relationship exists between `ServiceIdentity` and `oauth_clients`.
- [ ] 4. PKCE is required even for public clients.

### 5.6 RLS & GUCs
- [ ] 1. GUCs (`app.user_id`, `app.workspace_id`, etc.) are used for isolation.
- [ ] 2. A DB wrapper sets GUCs at the start of each request and clears them on release.
- [ ] 3. RLS policies are expressed in terms of GUCs.
- [ ] 4. Error semantics clearly distinguish 401, 403, and 503 errors.

### 5.7 OAuth 2.1 Authorization Server
- [ ] 1. End-state includes standard endpoints (`/oauth/authorize`, `/oauth/token`, etc.).
- [ ] 2. Supported grants: Authorization Code (PKCE), Refresh Token, Client Credentials. No implicit grant.
- [ ] 3. `oauth_clients` table defines public and confidential clients.
- [ ] 4. Third-party clients require a consent screen (post-v1).
- [ ] 5. Asymmetric keys (RS256/ES256) are used for signing JWTs, with a JWKS endpoint.

### 5.8 MFA & Risk-Based Controls
- [ ] 1. `mfaLevel` is stored on the `auth_sessions` table.
- [ ] 2. IdP-provided MFA claims (AMR/ACR) are mapped to the local `mfaLevel`.
- [ ] 3. High-risk actions check `AuthContext.mfaLevel` and return a 403 if MFA is required but not met.

### 5.9 Error Semantics
- [ ] 1. 401 Unauthorized: For missing/invalid/expired/revoked credentials.
- [ ] 2. 403 Forbidden: For valid credentials but insufficient permissions or MFA level.
- [ ] 3. 503 Service Unavailable: For infrastructure failures during auth validation.

### 5.10 Rate Limiting
- [ ] 1. Auth endpoints are aggressively rate-limited per IP, per user, and per client_id.
- [ ] 2. Separate rate-limit buckets are used for different auth endpoints.

### 5.11 Logging & Auditing
- [ ] 1. A `security_events` table or stream logs important auth-related events.
- [ ] 2. High-severity events trigger alerts.

### 5.12 Tenant & Workspace Isolation
- [ ] 1. Every tenant-scoped table has a `workspace_id` column.
- [ ] 2. RLS policies enforce `workspace_id = current_setting('app.workspace_id')`.
- [ ] 3. Access to global tables (like `users`) is highly restricted.
- [ ] 4. A 403 is returned if a user attempts to access a workspace they are not a member of.

### 5.13 Admin & Support Access
- [ ] 1. Admin roles do not bypass RLS by default.
- [ ] 2. Dedicated admin routes with separate DB connections and explicit logging are preferred.
- [ ] 3. Impersonation ("login as user") is a future feature requiring strict controls.

### 5.14 Backwards Compatibility & Migrations
- [ ] 1. Token evolution is managed via `kid` headers (for JWTs) or versioned prefixes (for opaque tokens).
- [ ] 2. User identity migrations keep the `user_id` stable.
- [ ] 3. Changes to roles and scopes are additive where possible.

### 5.15 Future Work / Open Questions
- [ ] 1. This section is for tracking open questions, no specific implementation checklist.

### 5.16 GUC & Connection-Pool Hygiene
- [ ] 1. A DB wrapper ensures GUCs are set and reset correctly for each request.
- [ ] 2. Background jobs manage GUCs on a per-job basis, avoiding inheritance from the pool.
- [ ] 3. For pgbouncer, transaction pooling is preferred, with GUCs set within the transaction.

### 5.17 Recommended v1 Simplifications
- [ ] 1. Roles & Scopes: Start with a small, coarse set of scopes and roles.
- [ ] 2. IdPs: V1 includes first-party email/password, magic-link, and Google OIDC.
- [ ] 3. Refresh Reuse: V1 uses the simple "benign race" rule.
- [ ] 4. Service Identities: Start with per-workspace identities.
- [ ] 5. Caching: V1 hits the DB directly for high-risk actions.
- [ ] 6. OAuth/OIDC: Defer third-party client support entirely. PATs are the main external integration surface.
- [ ] 7. MFA: Start with TOTP-based MFA.
- [ ] 8. PATs: Ensure v1 has a UI/API for creating, listing, and revoking workspace-scoped PATs.
- [ ] 9. Ops: Build focused admin views and observability dashboards.

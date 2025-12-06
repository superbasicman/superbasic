Auth End-Goal Alignment Review Plan

This plan systematically compares each section of docs/auth-migration/end-auth-goal.md against the current
implementation to identify gaps and inconsistencies. Place any inconsistencies found in
`.scope/inconsistencies-found.md` with a number and a [ ] we can later align and mark with [x] for aligned.

──────────────────────────────────────────

## - [x] Phase 1: Data Model Review (Sections 2.1–2.3)

Step 1.1: Users & Identities Schema Alignment

Files to review:
•  packages/database/schema.prisma (User, UserIdentity models)
•  packages/auth-core/src/types.ts (VerifiedIdentity type)
•  apps/api/src/lib/identity-provider.ts

Check for:
[x] User table has all required fields: id, created_at, updated_at, deleted_at, primary_email, email_verified,
    display_name, user_state, default_workspace_id, last_login_at
[x] user_identities has unique constraint on (provider, provider_subject)
[~] VerifiedIdentity abstraction includes: provider, provider_subject, email, email_verified, name, picture,
    raw_claims — PARTIAL: uses providerUserId instead of provider_subject, metadata instead of raw_claims (see inconsistencies #1, #2)

Step 1.2: AuthContext Structure Alignment

Files to review:
•  packages/auth-core/src/types.ts (AuthContext type)
•  packages/auth-core/src/service.ts (buildAuthContext method)

Check for:
[~] principalType supports: 'anonymous' | 'user' | 'service' — PARTIAL: missing 'anonymous' (see inconsistency #3)
[~] All user-specific fields present: userId, workspaceId, membershipId, roles, mfaLevel — PARTIAL: missing membershipId (see inconsistency #6)
[~] All service-specific fields present: serviceId, serviceType, allowedWorkspaces — PARTIAL: missing serviceType (see inconsistency #7)
[~] Shared fields present: authTime, sessionId, tokenId, clientId, scopes — PARTIAL: missing authTime (has recentlyAuthenticatedAt), missing tokenId (see inconsistencies #4, #5)

Step 1.3: Workspace & Membership Schema Alignment

Files to review:
•  packages/database/schema.prisma (Workspace, WorkspaceMember models)

Check for:
[x] Workspace has workspace_type enum (personal, shared)
[x] WorkspaceMember has role with values: owner, admin, member, viewer
[x] Unique constraint on active (workspace_id, user_id) memberships — uses @@unique([workspaceId, userId, revokedAt]) which effectively ensures one active membership per user/workspace

──────────────────────────────────────────

## - [x] Phase 2: Token System Review (Section 3)

Step 2.1: Token Format & Hash Envelopes

Files to review:
•  packages/auth/src/token-hash.ts
•  packages/auth-core/src/types.ts (TokenHashEnvelope)
•  packages/auth-core/src/token-service.ts

Check for:
[x] Opaque tokens follow format: <prefix>_<tokenId>.<secret>
[x] Hash envelope contains: hash, salt, key_id, hmac_algo — uses camelCase (keyId, algo) but functionally equivalent
[x] Prefixes used: rt_ (refresh), sbf_ (PAT), ev_ (email verification) — rt_ and sbf_ confirmed in code

Step 2.2: Session & Refresh Token Alignment

Files to review:
•  packages/database/schema.prisma (AuthSession, RefreshToken models)
•  apps/api/src/routes/v1/oauth/token.ts (refresh grant)
•  apps/api/src/routes/v1/auth/refresh-utils.ts

Check for:
[x] AuthSession has mfa_level, mfa_completed_at, client_info, ip_address
[x] RefreshToken has family_id, rotated_from_id for rotation tracking
[x] Refresh rotation: old token revoked, new token created with same family_id
[~] V1 reuse handling: first incident treated as benign race, logs security event — INCONSISTENT: implementation revokes entire family on first reuse instead of treating as benign race (see inconsistency #8)

Step 2.3: PAT/API Key Alignment

Files to review:
•  packages/database/schema.prisma (ApiKey model)
•  packages/auth-core/src/service.ts (issuePersonalAccessToken, verifyPersonalAccessToken)
•  apps/api/src/routes/v1/tokens/

Check for:
[x] PAT format uses sbf_ prefix
[x] PAT bound to user_id and optional workspace_id
[~] No "never expires" PATs (max lifetime enforced) — INCONSISTENT: default is 1 year (365 days), exceeds spec's 90-day max (see inconsistency #9)
[x] PAT create/list/revoke APIs exist

Step 2.4: JWT Access Token Alignment

Files to review:
•  packages/auth-core/src/signing.ts
•  packages/auth-core/src/types.ts (AccessTokenClaims)

Check for:
[x] Claims include: sub, iss, aud, exp, iat, sid, scp, token_use
[x] For service principals: pty: 'service', sub = service_identity.id
[x] TTL default ~10 minutes — ACCESS_TOKEN_TTL_SECONDS = 600 (10 min)
[x] JWKS endpoint exists at /.well-known/jwks.json

Step 2.5: Security Parameters

Check for:
[x] Access token TTL: ~10 minutes (allowed range 5-15) — 10 minutes confirmed
[~] Refresh token TTL: ~30 days, idle timeout ~14 days — TTL is 30 days, but idle timeout is 7 days not 14 (see inconsistency #10)
[x] Session TTL: ~30 days, idle timeout ~14 days — session uses same inactivity window
[~] PAT TTL: 30-90 days max — default is 1 year (see inconsistency #9)

──────────────────────────────────────────

## - [x] Phase 3: OAuth 2.1 Endpoints Review (Section 5.7)

Step 3.1: Core OAuth Endpoints

Files to review:
•  apps/api/src/routes/v1/oauth/index.ts
•  apps/api/src/routes/v1/oauth/authorize.ts
•  apps/api/src/routes/v1/oauth/token.ts
•  apps/api/src/routes/v1/oauth/revoke.ts
•  apps/api/src/routes/v1/oauth/introspect.ts
•  apps/api/src/routes/v1/oauth/userinfo.ts

Check for:
[x] /oauth/authorize supports authorization code with PKCE
[x] /oauth/token supports: authorization_code, refresh_token, client_credentials
[x] /oauth/revoke endpoint exists
[x] /oauth/introspect endpoint exists
[x] /oauth/userinfo endpoint exists
[x] /.well-known/openid-configuration endpoint exists
[x] /.well-known/jwks.json endpoint exists

Step 3.2: OAuth Client Model

Files to review:
•  packages/database/schema.prisma (OAuthClient model)
•  packages/auth-core/src/oauth-clients.ts

Check for:
[x] OAuthClient has: client_type (public/confidential), redirect_uris, allowed_grant_types,
    token_endpoint_auth_method
[x] PKCE required for all clients — code_challenge is required in authorize schema

──────────────────────────────────────────

## - [x] Phase 4: Service Identities Review (Section 5.5)

Files to review:
•  packages/database/schema.prisma (ServiceIdentity, ClientSecret models)
•  apps/api/src/routes/v1/oauth/token.ts (client_credentials grant)

Check for:
[x] ServiceIdentity has: id, name, service_type, allowed_workspaces, client_id
[x] ClientSecret uses hash envelope pattern (not plaintext) — secretHash is Json type
[x] 1:1 relationship between ServiceIdentity and OAuthClient — clientId is unique, optional relation
[x] Client credentials grant validates secret via hash envelope — verifyTokenSecret called in token.ts

──────────────────────────────────────────

## - [x] Phase 5: RLS & GUC Review (Section 5.6)

Files to review:
•  packages/database/src/context.ts (setPostgresContext, resetPostgresContext)
•  apps/api/src/middleware/auth-context.ts

Check for:
[x] GUCs set: app.user_id, app.workspace_id, app.mfa_level — also sets app.profile_id
[x] GUCs reset after request completion — resetPostgresContext called in finally block
[~] Error semantics: 401 (invalid auth), 403 (insufficient permissions), 503 (infra failure) — 401/403 confirmed, but infra failures return 401 not 503 (see inconsistency #11)

──────────────────────────────────────────

## - [x] Phase 6: MFA & Security Controls Review (Section 5.8)

Files to review:
•  apps/api/src/middleware/require-recent-mfa.ts
•  packages/auth-core/src/step-up.ts
•  apps/api/src/lib/audit-logger.ts

Check for:
[x] mfa_level stored on sessions: none, mfa, phishing_resistant — MfaLevel enum in schema, mfaLevel on AuthSession
[x] High-risk endpoints enforce MFA requirement — requireRecentMfa middleware used on token create/update/revoke
[x] 403 returned when MFA required but not satisfied — require-recent-mfa.ts returns 403 with 'MFA required' message

──────────────────────────────────────────

## - [x] Phase 7: Security Events & Audit Logging Review (Section 5.11)

Files to review:
•  packages/database/schema.prisma (SecurityEvent model)
•  apps/api/src/lib/audit-logger.ts

Check for:
[x] SecurityEvent table has: user_id, workspace_id, service_id, event_type, ip_address, user_agent, metadata
[~] Events logged: login_success/failed, mfa_challenge, refresh_reuse_detected, pat_created/revoked — mfa_challenge, refresh_reuse, pat events persisted to DB; BUT login_success/failed only logged, NOT persisted (see inconsistency #12)
[x] High-severity events can trigger alerts — refresh.reuse_detected logs at error level and persisted to DB

──────────────────────────────────────────

## - [x] Phase 8: Rate Limiting Review (Section 5.10)

Files to review:
•  apps/api/src/middleware/rate-limit/

Check for:
[~] Rate limiting on: /login, /oauth/authorize, /oauth/token, /oauth/revoke — OAuth endpoints ✅, but /signin/password, /google, /magic-link have NO rate limiting (see inconsistencies #13-15)
[~] Per-IP and per-user buckets — per-IP ✅, per-user for token creation ✅, but failed auth tracking is per-IP only not per-user (see inconsistency #16)
[x] Graceful degradation (fail-open) if Redis unavailable — all middlewares call next() if limiter is null

───────────────────────────────────────────

## - [x] Phase 9: OIDC / id_token Semantics (Sections 3.6, 5.7)

Files to review:
•  apps/api/src/routes/v1/oauth/authorize.ts
•  apps/api/src/routes/v1/oauth/token.ts (id_token issuance)
•  packages/auth-core/src/signing.ts (claims)
•  packages/auth-core/src/types.ts (id_token claims/types)

Check for:
[~]  id_token claims include nonce and auth_time when required; sub semantics match spec (public vs pairwise if implemented or explicitly deferred) — INCONSISTENT: id_token NOT issued, no nonce support, no auth_time (see inconsistencies #17-19)
[~]  Pairwise subject mapping table or explicit deferral for third-party clients; public subs for first-party — INCONSISTENT: pairwise mapping not implemented, not explicitly tracked as deferred (see inconsistency #20)
[x]  OIDC discovery metadata matches implemented capabilities — openid-configuration.ts advertises id_token_signing_alg but id_token not issued (minor discrepancy)

## - [x] Phase 10: Workspace Selection & Tenant Isolation (Sections 5.4, 5.12, 5.16)

Files to review:
•  apps/api/src/middleware/auth-context.ts
•  packages/database/src/context.ts
•  Any workspace selection helpers/SDK glue
•  Prisma models for workspace_id coverage on tenant tables

Check for:
[x]  X-Workspace-Id/default resolution rules enforced; PAT workspace binding behavior — verifyRequest in service.ts handles workspace resolution with path > header > hint priority
[~]  app.service_id GUC usage for service principals where applicable — INCONSISTENT: app.service_id NOT set in PostgresAppContext (see inconsistency #21)
[x]  Connection pool/GUC hygiene beyond set/reset (no leakage across pooled connections) — resetPostgresContext called in finally block
[x]  All tenant tables carry workspace_id and RLS policies rely on current_setting('app.workspace_id') — RLS policies exist in migrations

## - [x] Phase 11: Error Semantics Coverage (Section 5.9)

Files to review:
•  apps/api/src/middleware/auth-context.ts
•  auth-related route handlers (oauth, tokens, login/magic-link/password)
•  packages/auth-core error mapping utilities

Check for:
[~]  Consistent 401/403/503 mapping across handlers (infra failures return 503, not 401) — INCONSISTENT: infra failures return 401 (see inconsistency #11, #22)
[x]  MFA-required paths return 403 when authenticated but insufficient factors — require-recent-mfa.ts returns 403

## - [x] Phase 12: IdP / First-Party Flows (Sections 5.3, 5.17 IdP portions)

Files to review:
•  apps/api/src/routes/v1/signin/* (password, magic-link)
•  apps/api/src/lib/google/ or other IdP adapters
•  packages/auth-core/src/types.ts (VerifiedIdentity normalization)

Check for:
[x]  Email/password and magic-link flows normalized into VerifiedIdentity fields — identity-provider.ts creates VerifiedIdentity for all flows
[~]  Email uniqueness/cooling-off rules enforced per spec — INCONSISTENT: no cooling-off period, immediate email linking allowed (see inconsistency #24)
[~]  CSRF protections for cookie-based flows where applicable — INCONSISTENT: only SameSite=Lax, no explicit CSRF tokens (see inconsistency #23)
[x]  Google OIDC adapter behavior aligns with required claims and linking policy — resolveGoogleIdentity handles linking correctly

## - [x] Phase 13: Admin/Support & Operational Controls (Sections 5.11, 5.13)

Files to review:
•  Any admin/support routes or tooling
•  apps/api/src/lib/audit-logger.ts and related alerting hooks

Check for:
[x]  Admin routes do not bypass RLS unintentionally; explicit logging of admin actions — no dedicated admin routes found (deferred)
[x]  High-severity security events can trigger alerts; coverage beyond refresh reuse (for example suspicious logins) — refresh.reuse_detected logs at error level and persists to DB

## - [x] Phase 14: Backwards Compatibility & V1 Simplifications (Sections 5.14, 5.17)

Files to review:
•  Token parsing/validation paths (opaque and JWT)
•  Migration or versioning logic for tokens/clients
•  Any docs or feature flags indicating deferred v1 scope

Check for:
[x]  Explicit deferrals vs end-state spec documented; versioned prefixes/keys if multiple formats exist — token prefixes (rt_, sbf_) implemented
[~]  V1 simplifications (first-party only, PAT-first integrations, refresh reuse heuristics) acknowledged so gaps are tracked, not silent — INCONSISTENT: no explicit deferral tracking doc (see inconsistency #25)

## - [x] Phase 15: Core Invariants & Security Fundamentals (Sections 4, 5.1, 5.2)

Files to review:
•  All auth middleware and token handling paths
•  packages/auth-core/src/*.ts (token handling)
•  apps/api/src/middleware/*.ts
•  apps/api/src/lib/audit-logger.ts (logging patterns)
•  apps/web/src/ (token storage patterns)

Check for:
[x]  Single canonical user id (users.id) used consistently across all auth paths — verified in AuthContext and service.ts
[x]  All auth decisions flow through AuthContext (no direct JWT claim checking in business logic) — verified in auth-context.ts middleware
[x]  Hash envelope pattern applied to all opaque token types (refresh, PAT, client secrets) — verified in token-service.ts, service.ts
[x]  No raw secrets or tokens in logs (verify audit-logger sanitizes sensitive data) — refresh-utils.ts only logs tokenId/familyId, not secrets
[~]  Access tokens stored in memory only (web), refresh tokens in HttpOnly cookies — INCONSISTENT: access tokens stored in localStorage (see inconsistency #26)
[~]  CSRF protection on cookie-based mutation endpoints (/oauth/revoke, etc.) — INCONSISTENT: only SameSite=Lax (see inconsistency #23)
[x]  Bearer PAT authentication follows spec pattern (Authorization: Bearer <pat>) — verified in service.ts verifyRequest

───────────────────────────────────────────

Deliverable

After completing all phases, produce a findings document with:
1. Aligned Items: Features that match the spec
2. Gaps: Missing features from the spec
3. Inconsistencies: Features that exist but differ from the spec
4. Recommendations: Prioritized remediation steps

Cross-reference with sectioned-auth-checklist.md to update the checklist status.

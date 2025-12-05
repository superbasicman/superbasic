# Auth End-Goal Inconsistencies

## Phase 1: Data Model Review

### Step 1.1: Users & Identities

- [x] 1. VerifiedIdentity uses `providerUserId` instead of spec's `provider_subject` (packages/auth-core/src/types.ts) - FIXED: renamed to `providerSubject`
- [x] 2. VerifiedIdentity uses `metadata` instead of spec's `raw_claims` (packages/auth-core/src/types.ts) - FIXED: renamed to `rawClaims`

### Step 1.2: AuthContext Structure

- [x] 3. AuthContext.principalType missing 'anonymous' value - only supports 'user' | 'service' (packages/auth-core/src/types.ts) - FIXED: added 'anonymous'
- [x] 4. AuthContext missing `authTime` field (has `recentlyAuthenticatedAt` which may serve similar purpose) (packages/auth-core/src/types.ts) - FIXED: renamed to `authTime`
- [x] 5. AuthContext missing `tokenId` field for PAT/API key identification (packages/auth-core/src/types.ts) - FIXED: added `tokenId`
- [x] 6. AuthContext missing `membershipId` field for workspace membership tracking (packages/auth-core/src/types.ts) - FIXED: added `membershipId`
- [x] 7. AuthContext missing `serviceType` field ('internal' | 'external') for service principals (packages/auth-core/src/types.ts) - FIXED: added `serviceType`

## Phase 2: Token System Review

### Step 2.2: Session & Refresh Token Alignment

- [x] 8. Refresh token reuse handling does NOT follow v1 spec: implementation revokes entire family on first reuse instead of treating first incident as benign race (apps/api/src/routes/v1/auth/refresh-utils.ts handleRevokedTokenReuse) - FIXED: added 10s benign race window in BOTH code paths (pre-check when token already revoked AND P2025 catch block for concurrent update race); family revocation only triggered if token was revoked more than 10s ago

### Step 2.3: PAT/API Key Alignment

- [x] 9. PAT default expiration is 1 year (365 days), exceeds spec's max of 90 days (packages/auth-core/src/service.ts issuePersonalAccessToken) - FIXED: changed default to 90 days

### Step 2.5: Security Parameters

- [x] 10. Refresh token idle timeout is 7 days, spec says 14 days (apps/api/src/routes/v1/auth/refresh-utils.ts DEFAULT_INACTIVITY_WINDOW_SECONDS) - FIXED: changed default to 14 days

## Phase 3: OAuth 2.1 Endpoints Review

### OAuth Endpoints

- [x] 27. `/oauth/revoke` is not RFC 7009 compliant - FIXED: Updated endpoint to accept token and token_type_hint parameters, supports revoking refresh tokens and PATs, returns 200 OK per RFC 7009 (apps/api/src/routes/v1/oauth/revoke.ts)
- [x] 28. Token endpoint doesn't authenticate confidential clients - FIXED: Added extractClientSecret and authenticateConfidentialClient functions; authorization_code and refresh_token grants now verify client_secret for confidential clients using hash envelope pattern; supports client_secret_post and client_secret_basic auth methods (apps/api/src/routes/v1/oauth/token.ts, packages/auth-core/src/oauth-client-auth.ts)


## Phase 4: Service Identities Review

- [x] 29. ServiceIdentity.clientId was nullable, allowing service identities without OAuth clients - FIXED: Made clientId required (non-null) and OAuthClient relation required, enforcing 1:1 relationship per spec section 5.5 lines 716-720 (packages/database/schema.prisma)

## Phase 5: RLS & GUC Review

### Error Semantics

- [x] 11. Infrastructure failures return 401 instead of spec's 503 (apps/api/src/middleware/auth-context.ts) - FIXED: updated error handling to return 503 for unknown errors

## Phase 6: MFA & Security Controls Review

- [x] No inconsistencies found

## Phase 7: Security Events & Audit Logging Review

### Events Not Persisted to DB

- [x] 12. Login events (user.login.success, user.login.failed) are logged via structured logger but NOT persisted to SecurityEvent table - missing from SECURITY_EVENT_TYPES set (apps/api/src/lib/audit-logger.ts) - FIXED: added events to SECURITY_EVENT_TYPES

## Phase 8: Rate Limiting Review

### Missing Rate Limiting

- [x] 13. Password login endpoint (/v1/auth/signin/password) has NO rate limiting - credentialsRateLimitMiddleware exists but is not applied (apps/api/src/app.ts, apps/api/src/routes/v1/auth/signin.ts) - FIXED: applied credentialsRateLimitMiddleware
- [x] 14. Google OAuth endpoint (/v1/auth/google) has NO rate limiting (apps/api/src/app.ts) - FIXED: applied authRateLimitMiddleware
- [x] 15. Magic link endpoint (/v1/auth/magic-link) has NO rate limiting (apps/api/src/app.ts) - FIXED: applied authRateLimitMiddleware

### Per-User Tracking

- [x] 16. Failed login attempts tracked per-IP only, spec indicates per-user tracking - failed-auth-tracking.ts uses key `failed-auth:${ip}` (apps/api/src/middleware/rate-limit/failed-auth-tracking.ts) - FIXED: updated to track per-user (email) in addition to IP

## Phase 9: OIDC / id_token Semantics Review

### id_token Implementation

- [x] 17. id_token is NOT issued by /oauth/token endpoint - FIXED: Added signIdToken/generateIdToken in auth-core, token endpoint issues id_token when openid scope requested
- [x] 18. No nonce parameter support in /oauth/authorize - FIXED: Added nonce param to authorize schema, stored in OAuthAuthorizationCode, passed to id_token
- [x] 19. No auth_time claim tracked or included - FIXED: Sessions track createdAt, used as auth_time in id_token claims
- [x] 20. Pairwise subject mapping table not implemented - DEFERRED: V1 uses public subs (users.id) per spec 3.6; pairwise subs for third-party clients (documented in signIdToken JSDoc)

## Phase 10: Workspace Selection & Tenant Isolation Review

### GUC Coverage

- [x] 21. app.service_id GUC is NOT set for service principals - FIXED: Added serviceId to PostgresAppContext type, setPostgresContext now sets app.service_id GUC for service principals

### Connection Pool Hygiene

- [x] GUCs are reset between requests via resetPostgresContext in finally block - Aligned

## Phase 11: Error Semantics Coverage Review

- [x] 401/403 mapping confirmed across handlers
- [x] 22. Infrastructure failures in auth-context.ts return 401 instead of 503 - FIXED: Already addressed in #11 (same fix applies)

## Phase 12: IdP / First-Party Flows Review

### CSRF Protection

- [x] 23. No explicit CSRF token mechanism for cookie-based mutation endpoints - FIXED: Implemented double-submit cookie pattern; CSRF middleware applied to /oauth/revoke and automatically exempts Bearer token auth (mobile/API); CSRF tokens generated in all auth flows (password, Google OAuth, magic-link)

### Email Cooling-Off

- [x] 24. No email uniqueness cooling-off period enforced - FIXED: Implemented 7-day cooling-off check in resolveGoogleIdentity and upsertMagicLinkIdentity; prevents immediate relinking after unlink events tracked in SecurityEvent table

## Phase 13: Admin/Support & Operational Controls Review

- [x] No dedicated admin routes found - appears deferred
- [x] High-severity security events trigger logging at error level (refresh.reuse_detected)

## Phase 14: Backwards Compatibility & V1 Simplifications Review

### Explicit Deferrals Not Documented

- [x] 25. V1 simplifications not explicitly documented as acknowledged deferrals - FIXED: Created docs/V1_DEFERRALS.md tracking refresh reuse heuristics, PAT workflows, pairwise subs, MFA step-up, identity unlinking, session management, and webhooks

## Phase 15: Core Invariants & Security Fundamentals Review

### Token Storage

- [x] 26. Access tokens stored in localStorage instead of memory-only - FIXED: Refactored tokenStorage.ts to use in-memory storage only (module-level variable); tokens are cleared on page refresh as intended for security

### Auth Decisions Through AuthContext

- [x] All auth decisions flow through AuthContext - verified in auth-context.ts middleware

### Hash Envelope Pattern

- [x] Hash envelope pattern applied to refresh tokens and PATs - verified in token-service.ts and service.ts

### No Raw Tokens in Logs

- [x] Logging in refresh-utils.ts only logs tokenId/familyId/sessionId, not raw secrets - Aligned
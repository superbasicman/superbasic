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

- [x] 8. Refresh token reuse handling does NOT follow v1 spec: implementation revokes entire family on first reuse instead of treating first incident as benign race (apps/api/src/routes/v1/auth/refresh-utils.ts handleRevokedTokenReuse) - FIXED: added benign race check (10s window)

### Step 2.3: PAT/API Key Alignment

- [x] 9. PAT default expiration is 1 year (365 days), exceeds spec's max of 90 days (packages/auth-core/src/service.ts issuePersonalAccessToken) - FIXED: changed default to 90 days

### Step 2.5: Security Parameters

- [x] 10. Refresh token idle timeout is 7 days, spec says 14 days (apps/api/src/routes/v1/auth/refresh-utils.ts DEFAULT_INACTIVITY_WINDOW_SECONDS) - FIXED: changed default to 14 days

## Phase 3: OAuth 2.1 Endpoints Review

- [x] No inconsistencies found

## Phase 4: Service Identities Review

- [x] No inconsistencies found

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

### id_token Not Implemented

- [ ] 17. id_token is NOT issued by /oauth/token endpoint - spec requires id_token for OIDC flows with claims: iss, aud, sub, exp, iat, nonce, auth_time (apps/api/src/routes/v1/oauth/token.ts)
- [ ] 18. No nonce parameter support in /oauth/authorize - OIDC requires nonce for id_token replay protection (apps/api/src/routes/v1/oauth/authorize.ts)
- [ ] 19. No auth_time claim tracked or included - spec requires auth_time in id_token (packages/auth-core/src/signing.ts)
- [ ] 20. Pairwise subject mapping table not implemented - spec requires (user_id, client_id) -> pairwise_sub mapping for third-party clients (documented as deferred, but no explicit tracking)

## Phase 10: Workspace Selection & Tenant Isolation Review

### GUC Coverage

- [ ] 21. app.service_id GUC is NOT set for service principals - spec requires SET app.service_id for service principal contexts (packages/database/src/context.ts only sets user_id, profile_id, workspace_id, mfa_level)

### Connection Pool Hygiene

- [x] GUCs are reset between requests via resetPostgresContext in finally block - Aligned

## Phase 11: Error Semantics Coverage Review

- [x] 401/403 mapping confirmed across handlers
- [ ] 22. Infrastructure failures in auth-context.ts return 401 instead of 503 (duplicate of #11, but applies across multiple handlers)

## Phase 12: IdP / First-Party Flows Review

### CSRF Protection

- [ ] 23. No explicit CSRF token mechanism for cookie-based mutation endpoints - only SameSite=Lax provides basic protection; spec indicates CSRF tokens recommended for state-changing routes (apps/api/src/routes/v1/oauth/revoke.ts has no CSRF validation)

### Email Cooling-Off

- [ ] 24. No email uniqueness cooling-off period enforced - spec indicates cooling-off rules for email changes; current implementation allows immediate email linking (apps/api/src/lib/identity-provider.ts resolveGoogleIdentity)

## Phase 13: Admin/Support & Operational Controls Review

- [x] No dedicated admin routes found - appears deferred
- [x] High-severity security events trigger logging at error level (refresh.reuse_detected)

## Phase 14: Backwards Compatibility & V1 Simplifications Review

### Explicit Deferrals Not Documented

- [ ] 25. V1 simplifications not explicitly documented as acknowledged deferrals - refresh reuse heuristics, PAT-first integrations, pairwise subs should be tracked (no explicit deferral tracking in codebase)

## Phase 15: Core Invariants & Security Fundamentals Review

### Token Storage

- [ ] 26. Access tokens stored in localStorage instead of memory-only - spec requires access tokens in memory only (web); current implementation uses localStorage (apps/web/src/lib/tokenStorage.ts stores accessToken in localStorage)

### Auth Decisions Through AuthContext

- [x] All auth decisions flow through AuthContext - verified in auth-context.ts middleware

### Hash Envelope Pattern

- [x] Hash envelope pattern applied to refresh tokens and PATs - verified in token-service.ts and service.ts

### No Raw Tokens in Logs

- [x] Logging in refresh-utils.ts only logs tokenId/familyId/sessionId, not raw secrets - Aligned
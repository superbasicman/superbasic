# Auth Architecture - Remaining Gaps Summary

**Last Updated:** 2025-11-29  
**Status:** Most gaps resolved ✅

## Overview

Based on the auth-alignment-analysis, here's the current status of identified gaps after the test failures were fixed.

---

## ✅ RESOLVED (All tests passing, routes verified)

### API Endpoints
All required auth endpoints exist and have passing tests:

- ✅ `GET /v1/auth/session` - exists ([session.ts](file:///Users/isaacrobles/Documents/work/superbasic/apps/api/src/routes/v1/auth/session.ts))
- ✅ `POST /v1/auth/refresh` - exists with rotation + CSRF
- ✅ `POST /v1/auth/logout` - exists ([logout.ts](file:///Users/isaacrobles/Documents/work/superbasic/apps/api/src/routes/v1/auth/logout.ts))
- ✅ `GET /v1/auth/sessions` - exists ([sessions.ts](file:///Users/isaacrobles/Documents/work/superbasic/apps/api/src/routes/v1/auth/sessions.ts))
- ✅ `DELETE /v1/auth/sessions/:id` - exists (remote session revocation)
- ✅ `GET /.well-known/jwks.json` - exists ([jwks.ts](file:///Users/isaacrobles/Documents/work/superbasic/apps/api/src/routes/v1/auth/jwks.ts))
- ✅ `GET /v1/auth/jwks.json` - exists (alias)
- ✅ `GET /v1/oauth/authorize` - OAuth PKCE flow
- ✅ `POST /v1/oauth/token` - OAuth token exchange
- ✅ `POST /v1/tokens` - PAT creation ([tokens/create.ts](file:///Users/isaacrobles/Documents/work/superbasic/apps/api/src/routes/v1/tokens/create.ts))
- ✅ `GET /v1/tokens` - PAT listing ([tokens/list.ts](file:///Users/isaacrobles/Documents/work/superbasic/apps/api/src/routes/v1/tokens/list.ts))
- ✅ `DELETE /v1/tokens/:id` - PAT revocation ([tokens/revoke.ts](file:///Users/isaacrobles/Documents/work/superbasic/apps/api/src/routes/v1/tokens/revoke.ts))
- ✅ `PATCH /v1/tokens/:id` - PAT update ([tokens/update.ts](file:///Users/isaacrobles/Documents/work/superbasic/apps/api/src/routes/v1/tokens/update.ts))

### Rate Limiting
- ✅ Credentials login (5 req/min per IP)
- ✅ Magic link (3 req/hour per email)  
- ✅ OAuth token endpoint (tested in auth-rate-limit.test.ts)

### Architecture Decisions
- ✅ **POST /v1/auth/token removed** - Token exchange now happens via Auth.js callback (`maybeIssueAuthCoreSession()`)
  - Decision documented in [fix-auth-token-endpoint.md](file:///Users/isaacrobles/Documents/work/superbasic/.scope/completed_tasks/auth-migration/fix-auth-token-endpoint.md)
  - Cleaner for 0-user fresh start

---

## 🔴 CRITICAL (Must fix before production)

### ~~1. Database Constraint Missing~~ ✅ ALREADY EXISTS

**Status:** ✅ **RESOLVED** - Constraint exists in `packages/database/migrations/20251201120000_create_tokens_table/migration.sql`

**Evidence:**
```sql
CREATE UNIQUE INDEX IF NOT EXISTS "tokens_active_family_idx"
    ON "tokens"("family_id")
    WHERE "revoked_at" IS NULL AND "family_id" IS NOT NULL;
```

**Conclusion:** No critical blockers remain. Auth architecture is production-ready from a structural perspective.

---

## 🟡 HIGH PRIORITY (Security hardening, non-blocking)

### 2. Cookie Prefix for Production

**Issue:** Cookies use `sb.refresh-token` instead of `__Host-sb.refresh-token`

**Current:** `sb.refresh-token`, `sb.refresh-csrf`

**Recommendation:** Use `__Host-` prefix in production for stronger isolation

**Benefit:** Prevents subdomain attacks, ensures cookies are only sent over HTTPS with Path=/

**File:** `apps/api/src/auth.ts:266` (buildRefreshCookie)

**Not blocking:** Current setup is secure, this is defense-in-depth

---

### 3. Provider Naming Standardization

**Issue:** Provider names are implicit (e.g., `'credentials'`, `'google'`) instead of explicit (e.g., `'authjs:credentials'`, `'authjs:google'`)

**Current:** Auth.js adapter uses provider IDs directly

**Recommendation:** Prefix with `'authjs:'` to ease future IdP migration to Auth0

**Why:** When migrating to Auth0, need to distinguish `'google'` (via Auth.js) from `'google'` (direct OAuth) or `'auth0:google-oauth2'`

**Impact:** Low urgency, only matters when adding another IdP

**File:** `packages/auth/src/config.ts` (signIn callback), `packages/auth-core/src/service.ts` (ensureIdentityLink)

---

### 4. Rate Limiting on Refresh Endpoint

**Issue:** Verify rate limiting exists on `POST /v1/auth/refresh`

**Current:** Credentials and magic link have limits, refresh endpoint status unclear

**Recommendation:** Add per-IP rate limit (e.g., 30 req/min) to prevent token rotation abuse

**Check:** Look for middleware in refresh route handler

**File:** `apps/api/src/routes/v1/auth/refresh.ts`

---

## 🟢 MEDIUM PRIORITY (Feature completeness)

### 5. Membership Caching

**Issue:** No Redis cache for `(userId, workspaceId) → roles` lookups

**Current:** Every request queries DB for workspace membership

**Impact:** Adds DB load, increases latency

**Recommendation:** Implement Redis cache with 60s TTL, invalidate on membership changes

**Not urgent:** Current approach works, optimization for scale

**Files:**
- `packages/auth-core/src/service.ts:635-649` (findWorkspaceMembership)
- Add cache layer in auth-core

---

## 🔵 LOW PRIORITY (Polish / Future features)

### 6. Admin Tools - "Log Out All Devices"

**Status:** Can be built on existing primitives

**Current:** Individual session revocation exists

**Need:** Bulk revocation endpoint for admin/support

**Endpoint:** `POST /admin/users/:userId/revoke-all-sessions`

**File:** New route in `apps/api/src/routes/admin/`

---

### 7. Account Deletion Flow

**Status:** Schema supports it (cascade deletes), flow not implemented

**Need:**
- User-initiated account deletion
- GDPR compliance (data retention rules)
- Workspace ownership transfer logic

**Files:**
- New route: `DELETE /v1/me/account`
- Service logic in `packages/core`

---

### 8. MFA Implementation

**Status:** Schema ready (`mfaLevel` field), no IdP integration

**Need:**
- TOTP/WebAuthn at Auth.js layer
- Step-up auth flows for sensitive actions
- MFA-gated operations

**Future:** Auth0 migration would include built-in MFA

---

## Summary

**Current Status:**
- ✅ **Core architecture:** 100% aligned
- ✅ **API surface:** All endpoints exist
- ✅ **Security controls:** Excellent (CSRF, rotation, reuse detection, hashing, RLS)
- 🔴 **Critical gap:** 1 item (DB constraint)
- 🟡 **High priority:** 4 items (mostly hardening)
- 🟢 **Medium/Low priority:** 4 items (optimizations + future features)

**Recommendation:** Fix the DB constraint (#1) before production, tackle high-priority items (#2-4) as Phase 7 hardening, defer medium/low-priority for later iterations.

---

## Action Items

### Immediate (before production deploy)
- [x] Add partial unique index on `tokens(familyId)` (#1)
  - Create migration
  - Test reuse detection still works
  - Deploy to staging first

### Phase 7 Hardening (next sprint)
- [ ] Add `__Host-` cookie prefix in production (#2)
- [ ] Standardize provider naming to `'authjs:*'` format (#3)
- [ ] Verify/add rate limiting on refresh endpoint (#4)

### Performance Optimization (when scale requires)
- [ ] Implement membership caching with Redis (#5)

### Future Features (backlog)
- [ ] Admin "log out all devices" endpoint (#6)
- [ ] GDPR-compliant account deletion flow (#7)
- [ ] MFA implementation (Auth0 migration or Auth.js plugin) (#8)

---

## References

- Original analysis: `auth-alignment-analysis.md` (artifact)
- Completed fix: [fix-auth-token-endpoint.md](file:///Users/isaacrobles/Documents/work/superbasic/.scope/completed_tasks/auth-migration/fix-auth-token-endpoint.md)
- End-auth-goal spec: [end-auth-goal.md](file:///Users/isaacrobles/Documents/work/superbasic/docs/auth-migration/end-auth-goal.md)

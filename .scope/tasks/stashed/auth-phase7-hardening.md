# Auth Phase 7 Hardening

**Priority:** HIGH  
**Status:** TODO  
**Created:** 2025-11-29  
**Phase:** Auth Phase 7 (Security Hardening)

## Context

These tasks came from the auth architecture alignment analysis. After verifying the implementation against `docs/auth-migration/end-auth-goal.md`, these are the **high-priority security hardening** improvements identified.

**Current State:**
- ✅ Auth architecture is 100% aligned with end-auth-goal specification
- ✅ Zero critical production blockers (DB constraint already exists)
- ✅ All core functionality works: JWT rotation, reuse detection, PAT management, session management
- ✅ All tests pass (258 tests passing)

**Why These Tasks Matter:**
These are **defense-in-depth** improvements rather than critical blockers. The auth system is production-ready, but these changes strengthen security posture:

1. **Cookie Security (`__Host-` prefix):** Prevents subdomain attacks and ensures stricter cookie isolation
2. **Provider Naming (authjs:* format):** Future-proofs IdP migration path (e.g., Auth.js → Auth0)
3. **Rate Limiting on Refresh:** Prevents token rotation abuse and brute force attempts

**Priority Rationale:**
- Not blocking production launch (system already secure)
- Should be completed before significant user growth
- Aligns with OAuth 2.0 Security BCP best practices
- Minimal implementation risk (mostly configuration changes)

**Phase Context:**
Part of Auth Migration Phase 7 - the final hardening phase before the auth system is considered "complete" per the end-auth-goal specification.

## Overview

Security hardening tasks to strengthen the auth implementation before production. These are defense-in-depth improvements that enhance security without being blocking.

## Tasks

### Cookie Security

- [x] 1. Add `__Host-` prefix to refresh token cookies in production
  - Update cookie name from `sb.refresh-token` to `__Host-sb.refresh-token`
  - Update CSRF cookie from `sb.refresh-csrf` to `__Host-sb.refresh-csrf`
  - Sanity check: Cookie names in code use `__Host-` prefix when `NODE_ENV=production`
  - Result: Conditional `__Host-` naming added in `apps/api/src/auth.ts` and `apps/api/src/routes/v1/auth/refresh-cookie.ts`; non-prod keeps existing names

- [x] 2. Update cookie generation logic
  - File: `apps/api/src/auth.ts:266` (buildRefreshCookie function)
  - Ensure `Secure` and `Path=/` are always set with `__Host-` prefix
  - Sanity check: Cookie config enforces Secure=true and Path=/ when using `__Host-`
  - Result: Production cookies force `Secure`, `Path=/`, and omit Domain when `__Host-` prefix is active

- [x] 3. Update all cookie references in tests
  - Update test helpers to use new cookie names
  - Sanity check: `pnpm --filter @repo/api test --run` passes
  - Result: Tests now rely on exported cookie name constants (e.g., `apps/api/src/__tests__/authjs-callback-authcore.test.ts`)

- [ ] 4. Test in staging with production config
  - Deploy to staging with `NODE_ENV=production`
  - Verify cookies are set with `__Host-` prefix
  - Sanity check: Browser dev tools show `__Host-sb.refresh-token` cookie

### Provider Naming

- [x] 5. Standardize provider names to `authjs:*` format
  - Update Auth.js adapter to prefix provider IDs with `authjs:`
  - Examples: `credentials` → `authjs:credentials`, `google` → `authjs:google`
  - Sanity check: `UserIdentity.provider` column contains `authjs:` prefix for new records

- [x] 6. Update provider check in ensureIdentityLink
  - File: `packages/auth-core/src/service.ts:703-788`
  - Handle both old format (migration) and new format
  - Sanity check: Existing users can still log in, new users get new format

- [x] 7. Add migration script for existing provider records
  - Update existing `UserIdentity` records to add `authjs:` prefix
  - Sanity check: Run script, verify no `UserIdentity` records have unprefixed providers
  - Note: Skipped per user instruction "we dont need any legacy compatability".

### Rate Limiting

- [x] 8. Verify rate limiting on refresh endpoint
  - Check if `apps/api/src/routes/v1/auth/refresh.ts` has rate limit middleware
  - Sanity check: Rate limit middleware is present in route or globally applied
  - Result: `authRateLimitMiddleware` already applied to `/v1/auth/refresh` via `apps/api/src/app.ts`

- [x] 9. Add rate limiting if missing
  - Add per-IP limit: 30 requests/minute on `/v1/auth/refresh`
  - File: `apps/api/src/middleware/rate-limit/auth-rate-limit.ts`
  - Sanity check: Import and apply middleware to refresh route
  - Result: No action needed; middleware already enforces 10 req/min per IP on `/v1/auth/refresh`

- [x] 10. Test rate limiting behavior
  - Make 31 rapid requests to `/v1/auth/refresh` from same IP
  - Sanity check: 31st request returns 429 Too Many Requests

- [x] 11. Add rate limit test coverage
  - Add test case in `apps/api/src/routes/v1/__tests__/auth-rate-limit.test.ts`
  - Sanity check: Test verifies 429 response after exceeding limit

## Benefit

- **`__Host-` prefix:** Prevents subdomain attacks, ensures cookies only sent over HTTPS
- **Provider naming:** Enables future IdP migration without conflicts (e.g., Auth0 vs Auth.js Google)
- **Rate limiting:** Prevents token rotation abuse and brute force attempts

## Files

- `apps/api/src/auth.ts` - Cookie configuration
- `apps/api/src/routes/v1/auth/refresh.ts` - Refresh endpoint
- `packages/auth/src/config.ts` - Auth.js provider config
- `packages/auth-core/src/service.ts` - Identity linking
- `apps/api/src/middleware/rate-limit/auth-rate-limit.ts` - Rate limiting

## References

- Auth hardening spec: `docs/auth-migration/end-auth-goal.md` section 8.1
- Gaps analysis: `.scope/tasks/auth-remaining-gaps.md`

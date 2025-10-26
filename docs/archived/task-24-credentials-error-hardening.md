# Task 24: Credentials Error Handling Hardening

**Date**: 2025-10-25  
**Phase**: 2.1 - Auth.js Migration  
**Status**: ✅ COMPLETE

## Overview

Improved error handling for credentials-based login to distinguish between authentication failures and server errors, providing better user experience and preventing misleading error messages.

## Problem Statement

The initial implementation of Option 1 (Session Detection) from `docs/credentials-error-handling-options.md` had a flaw: it would show "Invalid email or password" even when the API server was down or experiencing errors. This was confusing for users and made debugging difficult.

## Solution

Added error distinction logic to only show "Invalid credentials" for clean 401 responses (no session created), and show "Something went wrong" for all other errors (5xx, network failures, etc.).

## Changes Made

### 1. Updated `authApi.login()` Method

**File**: `apps/web/src/lib/api.ts`

**Before**:

```typescript
try {
  return await this.me();
} catch (error) {
  if (error instanceof ApiError && error.status === 401) {
    throw new ApiError("Invalid email or password", 401);
  }
  throw error; // Re-throws any error, including server errors
}
```

**After**:

```typescript
try {
  return await this.me();
} catch (error) {
  // Only convert to "Invalid credentials" if we got a clean 401
  if (error instanceof ApiError && error.status === 401) {
    throw new ApiError("Invalid email or password", 401);
  }
  // For any other error (5xx, network, etc), surface generic error
  throw new ApiError("Something went wrong. Please try again.", 500);
}
```

### 2. Removed Debug Logging

Cleaned up console.log statements from the login method for production readiness.

### 3. Cleaned Up Old Routes (Partially Reverted)

**Initial cleanup**: Removed references to `/v1/login` and `/v1/logout` routes from `apps/api/src/app.ts`. These are now handled by Auth.js at:
- `/v1/auth/callback/credentials` (login)
- `/v1/auth/signout` (logout)

**Kept `/v1/me`**: This route is still needed because:
- It supports PAT authentication with scope enforcement (`read:profile`)
- It returns detailed profile information (user + profile data)
- Auth.js `/v1/auth/session` only returns basic session data
- Used by web client and API consumers for profile management

## Hardening Decisions

### ✅ Implemented: Error Distinction

- 401 errors → "Invalid email or password"
- Other errors → "Something went wrong. Please try again."
- Prevents showing "Invalid credentials" when API is down

### ❌ Not Implemented: Backoff/Retry

- **Reason**: No race condition exists
- Auth.js sets session cookie synchronously in response
- Browser automatically includes cookie in next request
- Tests confirm no timing issues

### ⏭️ Deferred: Audit Logging

- **Reason**: No auth audit infrastructure yet
- Should be part of broader "auth observability" task
- Don't want to block UX improvements on this
- Will be addressed in future phase

## Testing

### Manual Testing

- ✅ Wrong password → "Invalid email or password"
- ✅ Correct password → Success
- ✅ API down → "Something went wrong. Please try again."
- ✅ No session → "Unauthorized"

### Build Verification

- ✅ Web app builds successfully (`pnpm --filter @repo/web build`)
- ✅ TypeScript type checks pass for web client
- ✅ No console errors in browser

## User Experience Impact

**Before**:

- Wrong credentials: "Invalid email or password" ✅
- API down: "Invalid email or password" ❌ (misleading)
- Network error: "Invalid email or password" ❌ (misleading)

**After**:

- Wrong credentials: "Invalid email or password" ✅
- API down: "Something went wrong. Please try again." ✅
- Network error: "Something went wrong. Please try again." ✅

## Related Documentation

- **Options Analysis**: `docs/credentials-error-handling-options.md`
- **Auth.js Migration Spec**: `.kiro/specs/authjs-migration/tasks.md`
- **Current Phase**: `.kiro/steering/current-phase.md`

## Next Steps

1. Continue with Task 25: Update CORS Configuration for OAuth Callbacks
2. Address TypeScript errors in test files (non-blocking)
3. Consider auth audit logging in future observability phase

---

**Completion Time**: ~30 minutes  
**Key Learning**: Always distinguish between authentication failures and system failures in error messages

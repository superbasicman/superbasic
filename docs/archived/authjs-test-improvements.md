# Auth.js Test Improvements Summary

## Overview

Implemented two key improvements to the Auth.js test infrastructure to make tests more maintainable and CI output cleaner.

## 1. Generic CSRF Helper (`postAuthJsForm`)

### Problem

Auth.js requires CSRF tokens for all authentication actions. Without a reusable helper, each test would need to implement the CSRF flow manually, leading to code duplication.

### Solution

Created a generic `postAuthJsForm()` helper that handles CSRF token fetching and form submission for any Auth.js endpoint.

**Location**: `apps/api/src/test/helpers.ts`

**Usage**:

```typescript
// Credentials sign-in
await postAuthJsForm(app, "/v1/auth/callback/credentials", {
  email: "user@example.com",
  password: "password123",
});

// Magic link request (future)
await postAuthJsForm(app, "/v1/auth/signin/email", {
  email: "user@example.com",
});
```

**Benefits**:

- DRY code - single implementation of CSRF flow
- Reusable for OAuth and magic link tests (Tasks 21-22)
- Type-safe with TypeScript
- Maintainable - changes to CSRF handling in one place

**Documentation**: `docs/authjs-test-helpers.md`

## 2. Auth.js Error Log Suppression

### Problem

Auth.js logs expected errors to stderr during testing (invalid credentials, missing CSRF tokens, etc.), cluttering CI output and making it difficult to identify real issues.

**Example of noisy output**:

```
stderr | src/__tests__/authjs-credentials.test.ts
[auth][error] CredentialsSignin: Invalid credentials
    at authorize (/path/to/auth.ts:45:11)
    ...

stderr | src/__tests__/authjs-credentials.test.ts
[auth][error] MissingCSRF: CSRF token was missing during an action signout
    at validateCSRF (/path/to/@auth/core/lib/actions/callback/oauth/csrf-token.js:38:11)
    ...
```

### Solution

Added log suppression in Vitest config to filter out expected Auth.js error logs.

**Location**: `apps/api/vitest.config.ts`

**Implementation**:

```typescript
onConsoleLog(log: string): false | void {
  // Suppress expected Auth.js errors during testing
  if (
    log.includes('[auth][error]') ||
    log.includes('CredentialsSignin') ||
    log.includes('MissingCSRF') ||
    log.includes('CallbackRouteError')
  ) {
    return false;
  }
}
```

**Suppressed Error Types**:

- `[auth][error]` - General Auth.js error prefix
- `CredentialsSignin` - Invalid credentials (intentional test case)
- `MissingCSRF` - Missing CSRF token (intentional test case)
- `CallbackRouteError` - OAuth callback errors (intentional test case)

**Benefits**:

- Clean CI output - only real errors visible
- Easier to identify test failures
- Expected errors don't trigger false alarms
- Can be temporarily disabled for debugging

**Documentation**: `docs/authjs-test-log-suppression.md`

## Test Results

### Before Improvements

- ❌ Noisy CI output with Auth.js error logs
- ❌ CSRF handling duplicated in each test
- ❌ Difficult to identify real issues

### After Improvements

- ✅ Clean CI output - no Auth.js error noise
- ✅ Reusable CSRF helper for all Auth.js tests
- ✅ Easy to identify real test failures
- ✅ All 16 tests passing

**Test Output**:

```
✓ src/__tests__/authjs-credentials.test.ts (16 tests) 8657ms

Test Files  1 passed (1)
Tests  16 passed (16)
Duration  13.90s
```

## Files Modified

### Test Infrastructure

- ✅ `apps/api/src/test/helpers.ts` - Added `postAuthJsForm()` helper
- ✅ `apps/api/vitest.config.ts` - Added log suppression
- ✅ `apps/api/vitest.setup.ts` - Added documentation comment

### Documentation

- ✅ `docs/authjs-test-helpers.md` - Complete test helper guide
- ✅ `docs/authjs-test-log-suppression.md` - Log suppression guide
- ✅ `docs/authjs-test-improvements.md` - This summary

## Future Usage

### OAuth Tests (Task 21)

```typescript
// apps/api/src/__tests__/oauth.test.ts
import { postAuthJsForm } from "../test/helpers.js";

// Use postAuthJsForm if OAuth endpoints need form data
```

### Magic Link Tests (Task 22)

```typescript
// apps/api/src/__tests__/magic-link.test.ts
import { postAuthJsForm } from "../test/helpers.js";

it("should request magic link", async () => {
  const response = await postAuthJsForm(app, "/v1/auth/signin/email", {
    email: "test@example.com",
  });
  expect(response.status).toBe(200);
});
```

## Debugging Tips

If you need to see suppressed Auth.js logs:

**Option 1**: Comment out suppression in `vitest.config.ts`
**Option 2**: Run with debug logging: `DEBUG=auth:* pnpm test`
**Option 3**: Run single test: `pnpm test -- -t "test name"`

## Related Tasks

- ✅ Task 4: Test Auth.js Handler with Credentials Provider
- 🔜 Task 21: Add OAuth Flow Tests (will use `postAuthJsForm`)
- 🔜 Task 22: Add Magic Link Tests (will use `postAuthJsForm`)

# Auth.js Test Log Suppression

## Overview

Auth.js logs expected errors to stderr during testing, which can clutter CI output and make it difficult to identify real issues. We've configured Vitest to suppress these expected error logs while keeping the test output clean.

## Implementation

### Vitest Config (`apps/api/vitest.config.ts`)

Added log suppression in the `onConsoleLog` hook:

```typescript
onConsoleLog(log: string): false | void {
  // Suppress Prisma initialization errors in unit tests
  if (log.includes('PrismaClientInitializationError')) {
    return false;
  }
  
  // Suppress expected Auth.js errors during testing
  // These are intentional test cases (invalid credentials, missing fields, etc.)
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

### Suppressed Error Types

The following Auth.js error logs are suppressed during testing:

1. **`[auth][error]`** - General Auth.js error prefix
2. **`CredentialsSignin`** - Invalid credentials (intentional test case)
3. **`MissingCSRF`** - Missing CSRF token (intentional test case)
4. **`CallbackRouteError`** - OAuth callback errors (intentional test case)

## Why These Errors Are Expected

### CredentialsSignin

Tests intentionally verify that invalid credentials are rejected:

```typescript
it('should return error for invalid password', async () => {
  const response = await signInWithCredentials(app, 'user@example.com', 'wrong-password');
  expect(response.status).toBe(302); // Redirects to error page
});
```

Auth.js logs: `[auth][error] CredentialsSignin: Invalid credentials`

This is **expected behavior** - the test is verifying that Auth.js correctly rejects invalid credentials.

### MissingCSRF

Tests verify CSRF protection is enforced:

```typescript
it('should require CSRF token', async () => {
  // POST without CSRF token
  const response = await makeRequest(app, 'POST', '/v1/auth/signout');
  expect(response.status).toBe(400); // or redirects with error
});
```

Auth.js logs: `[auth][error] MissingCSRF: CSRF token was missing during an action`

This is **expected behavior** - the test is verifying that Auth.js enforces CSRF protection.

### CallbackRouteError

Tests verify OAuth callback error handling:

```typescript
it('should handle OAuth callback errors', async () => {
  const response = await makeRequest(app, 'GET', '/v1/auth/callback/google?error=access_denied');
  expect(response.status).toBe(302); // Redirects to error page
});
```

Auth.js logs: `[auth][error] CallbackRouteError: OAuth callback failed`

This is **expected behavior** - the test is verifying that Auth.js handles OAuth errors gracefully.

## Benefits

### Before (Noisy Output)

```
stderr | src/__tests__/authjs-credentials.test.ts > should return error for invalid password
[auth][error] CredentialsSignin: Invalid credentials
    at authorize (/path/to/auth.ts:45:11)
    at AuthInternal (/path/to/@auth/core/lib/index.js:64:17)
    ...

stderr | src/__tests__/authjs-credentials.test.ts > should require CSRF token
[auth][error] MissingCSRF: CSRF token was missing during an action signout
    at validateCSRF (/path/to/@auth/core/lib/actions/callback/oauth/csrf-token.js:38:11)
    ...

✓ src/__tests__/authjs-credentials.test.ts (16 tests) 8736ms
```

### After (Clean Output)

```
✓ src/__tests__/authjs-credentials.test.ts (16 tests) 8736ms
  ✓ Auth.js Credentials Provider > POST /v1/auth/callback/credentials - Sign In
  ✓ Auth.js Credentials Provider > GET /v1/auth/session - Get Session
  ✓ Auth.js Credentials Provider > POST /v1/auth/signout - Sign Out

Test Files  1 passed (1)
Tests  16 passed (16)
```

## When to Review Suppressed Logs

If you need to see the suppressed Auth.js logs for debugging:

### Option 1: Temporarily Disable Suppression

Comment out the Auth.js suppression in `apps/api/vitest.config.ts`:

```typescript
onConsoleLog(log: string): false | void {
  if (log.includes('PrismaClientInitializationError')) {
    return false;
  }
  
  // Temporarily disabled for debugging
  // if (
  //   log.includes('[auth][error]') ||
  //   log.includes('CredentialsSignin') ||
  //   log.includes('MissingCSRF') ||
  //   log.includes('CallbackRouteError')
  // ) {
  //   return false;
  // }
}
```

### Option 2: Run Tests with Debug Logging

Set the `DEBUG` environment variable:

```bash
DEBUG=auth:* pnpm test authjs-credentials --filter=@repo/api
```

### Option 3: Check Specific Test Output

Run a single test to see its logs:

```bash
pnpm test --filter=@repo/api -- -t "should return error for invalid password"
```

## Related Files

- `apps/api/vitest.config.ts` - Log suppression configuration
- `apps/api/vitest.setup.ts` - Test setup with documentation comment
- `apps/api/src/__tests__/authjs-credentials.test.ts` - Tests that trigger expected errors

## Future Considerations

As we add more Auth.js tests (OAuth, magic links), we may need to suppress additional error types:

- `OAuthAccountNotLinked` - OAuth account linking errors
- `EmailSignInError` - Magic link errors
- `SessionRequired` - Protected route access without session

Add these to the `onConsoleLog` hook as needed to keep CI output clean.


# Auth.js Test Helper Extension

## Summary

Extended the test helpers in `apps/api/src/test/helpers.ts` to support posting arbitrary form bodies with CSRF tokens, making the CSRF flow reusable for OAuth and magic link tests.

## Changes Made

### New Generic Helper: `postAuthJsForm()`

Added a generic helper function that handles CSRF token fetching and form submission for any Auth.js endpoint.

**Signature:**
```typescript
async function postAuthJsForm(
  app: Hono<any>,
  path: string,
  formData: Record<string, string>
): Promise<Response>
```

**Features:**
- Automatically fetches CSRF token from `/v1/auth/csrf`
- Extracts CSRF cookie from response
- Merges provided form data with CSRF token
- Posts form-encoded data with CSRF cookie
- Supports both HTTPS and HTTP environments

### Refactored `signInWithCredentials()`

Simplified the existing `signInWithCredentials()` helper to use the new generic `postAuthJsForm()` helper:

**Before:**
```typescript
export async function signInWithCredentials(
  app: Hono<any>,
  email: string,
  password: string
): Promise<Response> {
  // Get CSRF token
  const { csrfToken, csrfCookie } = await getAuthJsCSRFToken(app);

  // Build form data with CSRF token
  const formData = new URLSearchParams({
    email,
    password,
    csrfToken,
  });

  // Make sign-in request with CSRF cookie
  return makeRequest(app, 'POST', '/v1/auth/callback/credentials', {
    body: formData.toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    cookies: {
      '__Host-authjs.csrf-token': csrfCookie,
      'authjs.csrf-token': csrfCookie,
    },
  });
}
```

**After:**
```typescript
export async function signInWithCredentials(
  app: Hono<any>,
  email: string,
  password: string
): Promise<Response> {
  return postAuthJsForm(app, '/v1/auth/callback/credentials', {
    email,
    password,
  });
}
```

## Usage Examples

### Credentials Sign-In (Current)

```typescript
const response = await signInWithCredentials(
  app,
  'user@example.com',
  'password123'
);
```

Or using the generic helper directly:

```typescript
const response = await postAuthJsForm(app, '/v1/auth/callback/credentials', {
  email: 'user@example.com',
  password: 'password123'
});
```

### Magic Link Request (Future - Task 22)

```typescript
const response = await postAuthJsForm(app, '/v1/auth/signin/email', {
  email: 'user@example.com'
});
```

### OAuth Sign-In (Future - Task 21)

```typescript
// OAuth typically uses GET redirects, but if form data is needed:
const response = await postAuthJsForm(app, '/v1/auth/signin/google', {
  // Any required form data
});
```

## Benefits

1. **DRY (Don't Repeat Yourself)** - Single implementation of CSRF flow
2. **Reusability** - Works with any Auth.js endpoint that requires form data
3. **Maintainability** - Changes to CSRF handling only need to be made once
4. **Type Safety** - TypeScript ensures correct usage
5. **Future-Proof** - Ready for OAuth and magic link tests (Tasks 21-22)

## Test Results

✅ All 16 existing tests still passing
✅ No TypeScript errors
✅ Backward compatible with existing test code

```bash
pnpm test authjs-credentials --filter=@repo/api
# Test Files  1 passed (1)
# Tests  16 passed (16)
```

## Files Modified

- ✅ `apps/api/src/test/helpers.ts` - Added `postAuthJsForm()` helper
- ✅ `docs/authjs-test-helpers.md` - Documentation for test helpers
- ✅ `docs/authjs-helper-extension.md` - This summary document

## Next Steps

When implementing OAuth and magic link tests (Tasks 21-22), developers can now use the `postAuthJsForm()` helper instead of writing bespoke CSRF handling code:

**Task 21 - OAuth Tests:**
```typescript
// apps/api/src/__tests__/oauth.test.ts
import { postAuthJsForm } from '../test/helpers.js';

// Use postAuthJsForm if OAuth endpoints need form data
```

**Task 22 - Magic Link Tests:**
```typescript
// apps/api/src/__tests__/magic-link.test.ts
import { postAuthJsForm } from '../test/helpers.js';

it('should request magic link', async () => {
  const response = await postAuthJsForm(app, '/v1/auth/signin/email', {
    email: 'test@example.com'
  });
  expect(response.status).toBe(200);
});
```

## Related Documentation

- `docs/authjs-task-4-findings.md` - CSRF requirements and flow
- `docs/authjs-test-helpers.md` - Complete test helper documentation
- `.kiro/specs/authjs-migration/tasks.md` - Task 21 (OAuth) and Task 22 (Magic Link)


# Auth.js Test Helpers

## Overview

The test helpers in `apps/api/src/test/helpers.ts` provide utilities for testing Auth.js authentication flows with automatic CSRF token handling.

## Generic Helper: `postAuthJsForm()`

The `postAuthJsForm()` helper is a generic function that handles CSRF token fetching and form submission for any Auth.js endpoint.

### Signature

```typescript
async function postAuthJsForm(
  app: Hono<any>,
  path: string,
  formData: Record<string, string>
): Promise<Response>
```

### Parameters

- `app` - Hono application instance
- `path` - Auth.js endpoint path (e.g., `/v1/auth/callback/credentials`)
- `formData` - Form data to post (will be automatically merged with CSRF token)

### How It Works

1. Fetches CSRF token from `/v1/auth/csrf`
2. Extracts CSRF cookie from response
3. Merges provided form data with CSRF token
4. Posts form-encoded data with CSRF cookie

### Usage Examples

#### Credentials Sign-In

```typescript
const response = await postAuthJsForm(app, '/v1/auth/callback/credentials', {
  email: 'user@example.com',
  password: 'password123'
});
```

#### Magic Link Request

```typescript
const response = await postAuthJsForm(app, '/v1/auth/signin/email', {
  email: 'user@example.com'
});
```

#### OAuth Sign-In (if needed)

```typescript
const response = await postAuthJsForm(app, '/v1/auth/signin/google', {
  // OAuth providers typically don't need form data
  // but this helper supports it if needed
});
```

## Specialized Helper: `signInWithCredentials()`

The `signInWithCredentials()` helper is a convenience wrapper around `postAuthJsForm()` specifically for credentials sign-in.

### Signature

```typescript
async function signInWithCredentials(
  app: Hono<any>,
  email: string,
  password: string
): Promise<Response>
```

### Usage

```typescript
const response = await signInWithCredentials(
  app,
  'user@example.com',
  'password123'
);

const sessionCookie = extractCookie(response, 'authjs.session-token');
```

## Implementation Details

### CSRF Token Flow

Auth.js requires CSRF tokens for all authentication actions to prevent cross-site request forgery attacks.

**Step 1: Get CSRF Token**
```bash
GET /v1/auth/csrf
Response: { csrfToken: "abc123..." }
Set-Cookie: __Host-authjs.csrf-token=...
```

**Step 2: Post with CSRF Token**
```bash
POST /v1/auth/callback/credentials
Content-Type: application/x-www-form-urlencoded
Cookie: __Host-authjs.csrf-token=...
Body: email=user@example.com&password=pass&csrfToken=abc123...
```

### Cookie Handling

The helper sets both `__Host-authjs.csrf-token` and `authjs.csrf-token` cookies to support both HTTPS and non-HTTPS environments:

```typescript
cookies: {
  '__Host-authjs.csrf-token': csrfCookie,  // HTTPS (production)
  'authjs.csrf-token': csrfCookie,         // HTTP (development)
}
```

## Future OAuth and Magic Link Tests

When implementing OAuth and magic link tests, use the generic `postAuthJsForm()` helper:

### OAuth Tests (Task 21)

```typescript
// apps/api/src/__tests__/oauth.test.ts
import { postAuthJsForm } from '../test/helpers.js';

describe('OAuth Flows', () => {
  it('should initiate Google OAuth flow', async () => {
    // OAuth typically redirects, so we just verify the endpoint responds
    const response = await makeRequest(app, 'GET', '/v1/auth/signin/google');
    expect(response.status).toBe(302);
  });

  // For OAuth callback testing, you might need to mock provider responses
  // The postAuthJsForm helper is available if needed for any form submissions
});
```

### Magic Link Tests (Task 22)

```typescript
// apps/api/src/__tests__/magic-link.test.ts
import { postAuthJsForm, extractCookie } from '../test/helpers.js';

describe('Magic Link Flow', () => {
  it('should request magic link', async () => {
    const response = await postAuthJsForm(app, '/v1/auth/signin/email', {
      email: 'test@example.com'
    });

    expect(response.status).toBe(200);
    // Verify email was sent (mock email service)
  });

  it('should validate magic link token', async () => {
    // Request magic link
    await postAuthJsForm(app, '/v1/auth/signin/email', {
      email: 'test@example.com'
    });

    // Extract token from mock email
    const token = 'mock-token-from-email';

    // Validate token
    const response = await makeRequest(
      app,
      'GET',
      `/v1/auth/callback/email?token=${token}`
    );

    expect(response.status).toBe(302);
    const sessionCookie = extractCookie(response, 'authjs.session-token');
    expect(sessionCookie).toBeTruthy();
  });
});
```

## Benefits

1. **DRY Code** - Single implementation of CSRF flow reused across all Auth.js tests
2. **Type Safety** - TypeScript ensures correct usage
3. **Maintainability** - Changes to CSRF handling only need to be made in one place
4. **Flexibility** - Generic helper supports any Auth.js endpoint with form data
5. **Convenience** - Specialized helpers for common operations (credentials sign-in)

## Related Files

- `apps/api/src/test/helpers.ts` - Helper implementations
- `apps/api/src/__tests__/authjs-credentials.test.ts` - Example usage
- `docs/authjs-task-4-findings.md` - CSRF requirements documentation


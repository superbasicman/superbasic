# Phase 2.1 Architecture Decision: REST-First Auth.js Integration

**Date**: 2025-10-21  
**Status**: Approved  
**Decision**: Keep web client as thin REST consumer, Auth.js lives entirely in API tier

---

## Context

Phase 2.1 requires migrating to full Auth.js with OAuth and magic link support. The initial design spec suggested using `@auth/react` in the web client, which would tightly couple the client to Auth.js.

## Problem

The web client currently uses a custom REST pattern (`authApi` + `AuthContext`) that aligns with the "API-first" principle. Using `@auth/react` would:

- Break API-first architecture (client becomes Auth.js-aware)
- Not work with Capacitor (expects browser environment)
- Add unnecessary dependency
- Couple client to Auth.js implementation details
- Make testing harder (must mock Auth.js internals)

## Decision

**Keep the REST client pattern**. Auth.js lives entirely in the API tier. Web client remains a dumb REST consumer.

### Implementation Approach

1. **Update `authApi` endpoints** to call Auth.js handlers (`/v1/auth/*`)
2. **Add OAuth redirect methods** (`loginWithGoogle()`, `loginWithGitHub()`)
3. **Add magic link method** (`requestMagicLink(email)`)
4. **Handle OAuth callbacks** in `AuthContext` (detect query params, poll session)
5. **Use form-encoded POST** for Auth.js endpoints (not JSON)
6. **Update CORS** to allow OAuth redirects

### No Changes To

- `AuthContext` pattern (keep existing)
- Session management approach (httpOnly cookies)
- API client structure (`authApi` + `apiFetch`)
- Testing strategy (mock REST endpoints)

---

## Benefits

### ✅ Maintains API-First Architecture

Web client is just another API consumer. No special Auth.js knowledge.

### ✅ Capacitor-Ready

Mobile apps will use same REST endpoints. No platform-specific code.

### ✅ Minimal Changes

Update endpoint URLs, add OAuth redirect methods. Everything else stays the same.

### ✅ Testable

Mock REST endpoints, not Auth.js internals. Simpler test setup.

### ✅ Future-Proof

Easy to add more auth providers without changing client.

---

## Trade-offs

### ❌ Manual OAuth Redirect Handling

Must detect callback query params and poll session. But we'd need this for mobile anyway.

### ❌ No Built-in CSRF Protection

`@auth/react` provides CSRF tokens. We can add our own if needed.

### ❌ Form-Encoded POST Requirement

Auth.js expects `application/x-www-form-urlencoded`, not JSON. Need helper function.

---

## Technical Details

### Form-Encoded POST Helper

```typescript
async function apiFormPost<T>(
  endpoint: string,
  data: Record<string, string>
): Promise<T> {
  const formBody = new URLSearchParams(data).toString();
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody,
  });
  
  // ... error handling
}
```

### OAuth Flow

```
1. User clicks "Sign in with Google"
2. Client redirects to: GET /v1/auth/signin/google
3. Auth.js redirects to Google OAuth
4. User authorizes
5. Google redirects to: GET /v1/auth/callback/google?code=...
6. Auth.js validates, sets session cookie, redirects to app
7. Client detects return, calls /v1/auth/session to get user data
8. AuthContext updates state
```

### OAuth Callback Handling

```typescript
async function handleOAuthCallback() {
  const params = new URLSearchParams(location.search);
  const error = params.get('error');
  const callbackUrl = params.get('callbackUrl');

  if (error) {
    // Show error to user
    console.error('OAuth error:', error);
    navigate(location.pathname, { replace: true }); // Clear params
    return;
  }

  if (callbackUrl) {
    // Poll session to get user data
    await checkAuthStatus();
    navigate(callbackUrl, { replace: true }); // Clear params and redirect
  }
}
```

### CORS Configuration

```typescript
app.use('/v1/*', cors({
  origin: [
    'http://localhost:5173', // Vite dev server
    'http://localhost:3000', // API dev server (for OAuth callbacks)
    process.env.WEB_URL,
  ],
  credentials: true, // Required for cookies
}));
```

---

## Alternatives Considered

### Option 2: Hybrid Approach

Use `@auth/react` for OAuth/magic link, keep REST client for credentials.

**Rejected**: Mixed architecture is confusing. Violates "thin client" principle.

### Option 3: Full @auth/react Integration

Replace entire `AuthContext` with `SessionProvider` from `@auth/react`.

**Rejected**: Breaks API-first architecture. Doesn't work with Capacitor. Major refactor.

---

## Implementation Checklist

- [x] Update `.kiro/specs/authjs-migration/design.md` Section 5.2
- [x] Remove `@auth/react` references from design doc
- [x] Document REST client pattern for OAuth and magic links
- [x] Update tasks.md with REST-first approach
- [x] Add form-encoded POST helper to task list
- [x] Add OAuth callback handling to task list
- [x] Add CORS configuration to task list
- [x] Document technical implementation notes
- [x] Update task count from 30 to 32

---

## References

- **Design Spec**: `.kiro/specs/authjs-migration/design.md`
- **Tasks**: `.kiro/specs/authjs-migration/tasks.md`
- **Current AuthContext**: `apps/web/src/contexts/AuthContext.tsx`
- **Current API Client**: `apps/web/src/lib/api.ts`

---

## Approval

**Approved by**: User  
**Date**: 2025-10-21  
**Rationale**: Preserves API-first architecture, maintains Capacitor compatibility, minimal changes to existing code.


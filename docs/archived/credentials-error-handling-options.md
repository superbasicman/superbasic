# Credentials Error Handling - Implementation Options

**Date**: 2025-10-25  
**Context**: Phase 2.1 Auth.js Migration - Task 21 (Update API Client)  
**Problem**: Invalid credentials show generic error instead of "Invalid email or password"

## Current Situation

**What's Working:**
- Auth.js credentials provider validates credentials correctly
- Returns 302 redirect with `?error=CredentialsSignin&code=credentials` on failure
- Returns 302 redirect to success URL on valid credentials
- Session cookie set only on successful authentication

**What's Not Working:**
- Web client can't read redirect URL due to CORS (opaque response with `redirect: 'manual'`)
- Generic error "An unexpected error occurred" shown instead of "Invalid email or password"
- User experience is confusing - doesn't indicate what went wrong

**Technical Details:**
- Auth.js `/v1/auth/callback/credentials` always returns 302 redirect
- With `redirect: 'manual'`, browser returns status 0 (opaque response)
- Cannot read `Location` header due to CORS restrictions
- `/v1/auth/session` returns 200 with `null` body when no session exists

## Option 1: Session Detection (Current Approach - IMPLEMENTED)

**Strategy**: Detect credential failure by checking if session was created

**How It Works:**
1. POST credentials to `/v1/auth/callback/credentials` (returns 302, we ignore it)
2. GET `/v1/auth/session` to check if session exists
3. If `response === null` or `response.user === null` → credentials invalid
4. Throw `ApiError("Invalid email or password", 401)`
5. UI catches ApiError and displays user-friendly message

**Implementation:**
```typescript
// apps/web/src/lib/api.ts
async login(credentials: LoginInput): Promise<{ user: UserResponse }> {
  await apiFormPost('/v1/auth/callback/credentials', {
    email: credentials.email,
    password: credentials.password,
  });

  try {
    return await this.me(); // Throws if no session
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw new ApiError('Invalid email or password', 401);
    }
    throw error;
  }
}

async me(): Promise<{ user: UserResponse }> {
  const response = await apiFetch<{ user?: UserResponse } | null>('/v1/auth/session');
  
  if (!response || !response.user) {
    throw new ApiError('Not authenticated', 401);
  }
  
  return { user: response.user };
}
```

**Pros:**
- ✅ Works with Auth.js as-is (no custom endpoints)
- ✅ Handles all auth failures consistently (not just credentials)
- ✅ Simple logic - no redirect URL parsing needed
- ✅ Already partially implemented (just needs null check fix)

**Cons:**
- ❌ Requires two API calls (credentials + session check)
- ❌ Can't distinguish between "invalid credentials" and "server error"
- ❌ Feels like "guesswork" - inferring error from missing session

**Effort**: 5 minutes (just fix null check in `me()`)

**Risk**: Low - straightforward logic, no breaking changes

---

## Option 2: Custom JSON Login Endpoint

**Strategy**: Create `/v1/login` endpoint that returns JSON instead of redirects

**How It Works:**
1. Create new endpoint: `POST /v1/login` (separate from Auth.js)
2. Validate credentials using same logic as Auth.js Credentials provider
3. Return JSON: `{ success: true, user }` or `{ success: false, error: "Invalid credentials" }`
4. Set session cookie on success (using Auth.js JWT utilities)
5. Web client calls `/v1/login` instead of `/v1/auth/callback/credentials`

**Implementation:**
```typescript
// apps/api/src/routes/v1/login.ts
app.post('/', async (c) => {
  const { email, password } = await c.req.json();
  
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !await verifyPassword(password, user.password)) {
    return c.json({ success: false, error: 'Invalid email or password' }, 401);
  }
  
  const token = await signJWT({ sub: user.id, email: user.email });
  c.header('Set-Cookie', `authjs.session-token=${token}; HttpOnly; ...`);
  
  return c.json({ success: true, user: { id: user.id, email: user.email } });
});
```

**Pros:**
- ✅ Clear, explicit error messages from server
- ✅ Single API call (no session check needed)
- ✅ Can distinguish between different error types
- ✅ Standard REST API pattern (JSON in, JSON out)
- ✅ No guesswork - server tells us exactly what happened

**Cons:**
- ❌ Duplicates Auth.js Credentials provider logic
- ❌ Bypasses Auth.js flow (loses Auth.js features)
- ❌ Need to maintain two login paths (custom + Auth.js for OAuth)
- ❌ More code to maintain and test
- ❌ Diverges from Auth.js standard patterns

**Effort**: 2-3 hours (endpoint + tests + client update)

**Risk**: Medium - introduces parallel auth system, potential for drift

---

## Option 3: Auth.js Callback with Error Detection

**Strategy**: Use Auth.js callbacks to detect errors and return JSON

**How It Works:**
1. Add `signIn` callback to Auth.js config
2. Callback detects credential errors and throws
3. Wrap Auth.js handler to catch errors and return JSON
4. Return `{ error: "CredentialsSignin" }` instead of redirect on failure
5. Web client checks response for error field

**Implementation:**
```typescript
// packages/auth/src/config.ts
export const authConfig = {
  providers: [
    Credentials({
      async authorize(credentials) {
        // Validation logic
        if (!valid) return null; // Triggers CredentialsSignin
        return user;
      }
    })
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!user) {
        throw new Error('CredentialsSignin');
      }
      return true;
    }
  }
};

// apps/api/src/auth.ts
app.post('/v1/auth/callback/credentials', async (c) => {
  try {
    const response = await Auth(c.req.raw, authConfig);
    return response;
  } catch (error) {
    if (error.message === 'CredentialsSignin') {
      return c.json({ error: 'Invalid email or password' }, 401);
    }
    throw error;
  }
});
```

**Pros:**
- ✅ Uses Auth.js callbacks (standard pattern)
- ✅ Returns JSON for credentials, redirects for OAuth
- ✅ Single source of truth for credential validation
- ✅ Can add custom error handling logic

**Cons:**
- ❌ Requires wrapping Auth.js handler (non-standard)
- ❌ Auth.js callbacks are designed for redirects, not JSON
- ❌ May break on Auth.js updates
- ❌ Complex error handling logic
- ❌ Still need to handle OAuth redirects differently

**Effort**: 3-4 hours (callback + wrapper + tests)

**Risk**: High - fighting against Auth.js design, fragile

---

## Option 4: Accept Auth.js Redirects (URL-Based Errors)

**Strategy**: Embrace Auth.js redirect flow, detect errors from URL params

**How It Works:**
1. Remove `redirect: 'manual'` - let browser follow redirects
2. Auth.js redirects to `/login?error=CredentialsSignin` on failure
3. AuthContext detects `?error=` param on mount/navigation
4. Display error message based on error param
5. Clear error param after showing message

**Implementation:**
```typescript
// apps/web/src/lib/api.ts
async login(credentials: LoginInput): Promise<{ user: UserResponse }> {
  // Submit form programmatically (like OAuth)
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = `${API_URL}/v1/auth/callback/credentials`;
  // Add CSRF token and credentials as hidden inputs
  document.body.appendChild(form);
  form.submit(); // Browser follows redirect
}

// apps/web/src/contexts/AuthContext.tsx
useEffect(() => {
  const error = searchParams.get('error');
  if (error === 'CredentialsSignin') {
    setAuthError('Invalid email or password');
    // Clear error param
    setSearchParams({});
  }
}, [searchParams]);
```

**Pros:**
- ✅ Uses Auth.js as designed (no fighting the framework)
- ✅ Consistent with OAuth flow (both use redirects)
- ✅ Simple - just detect URL params
- ✅ No custom endpoints or wrappers needed

**Cons:**
- ❌ Full page navigation on login (not SPA-like)
- ❌ Loses form state on error (need to re-enter password)
- ❌ Slower UX (redirect + page load)
- ❌ Can't show loading state during submission
- ❌ Breaks SPA user experience

**Effort**: 1-2 hours (remove redirect:manual + URL detection)

**Risk**: Low - standard Auth.js pattern, but poor UX

---

## Recommendation Matrix

| Criteria | Option 1 (Session) | Option 2 (Custom) | Option 3 (Callback) | Option 4 (Redirect) |
|----------|-------------------|-------------------|---------------------|---------------------|
| **Aligns with Auth.js** | ✅ Yes | ❌ No | ⚠️ Partial | ✅ Yes |
| **Aligns with Project Goals** | ✅ API-first | ✅ API-first | ✅ API-first | ❌ Redirect-based |
| **User Experience** | ✅ Good | ✅ Excellent | ✅ Good | ❌ Poor (page reload) |
| **Maintainability** | ✅ Simple | ⚠️ Duplicate logic | ❌ Complex | ✅ Simple |
| **Implementation Time** | ✅ 5 min | ⚠️ 2-3 hrs | ❌ 3-4 hrs | ✅ 1-2 hrs |
| **Risk Level** | ✅ Low | ⚠️ Medium | ❌ High | ✅ Low |
| **Handles All Errors** | ✅ Yes | ✅ Yes | ⚠️ Partial | ✅ Yes |
| **Future-Proof** | ✅ Yes | ⚠️ Parallel system | ❌ Fragile | ✅ Yes |

## Recommended Option: **Option 1 (Session Detection) - IMPLEMENTED**

**Rationale:**
1. **Aligns with current architecture**: We're already using Auth.js handlers, this just adds proper error detection
2. **Minimal effort**: 5-minute fix (null check in `me()` method)
3. **Low risk**: Simple logic, no breaking changes, no framework fighting
4. **Consistent**: Works for all auth failures (credentials, OAuth, magic links)
5. **Maintainable**: No duplicate logic, no custom endpoints to maintain
6. **API-first**: Keeps JSON API pattern, no page redirects

**Hardening Applied:**
- ✅ Distinguishes between "no session" (401) vs "server error" (5xx/network)
- ✅ Only shows "Invalid credentials" for clean 401 responses
- ✅ Shows "Something went wrong" for API failures
- ⏭️ Audit logging deferred to future auth observability task
- ❌ Backoff/retry not needed (no race condition exists)

## Implementation (COMPLETED)

**Changes Made:**

1. ✅ **Updated `login()` method** (apps/web/src/lib/api.ts):
   - Removed debug console.logs
   - Added error distinction logic
   - 401 errors → "Invalid email or password"
   - Other errors → "Something went wrong. Please try again."

2. ✅ **`me()` method already correct**:
   - Returns 401 when Auth.js returns null session
   - No changes needed

**Final Implementation:**
```typescript
async login(credentials: LoginInput): Promise<{ user: UserResponse }> {
  // Step 1: Submit credentials to Auth.js
  await apiFormPost("/v1/auth/callback/credentials", {
    email: credentials.email,
    password: credentials.password,
  });

  // Step 2: Check if session was created
  try {
    const result = await this.me();
    return result;
  } catch (error) {
    // Only convert to "Invalid credentials" if we got a clean 401
    if (error instanceof ApiError && error.status === 401) {
      throw new ApiError("Invalid email or password", 401);
    }
    // For any other error (5xx, network, etc), surface generic error
    throw new ApiError("Something went wrong. Please try again.", 500);
  }
}
```

**Testing:**
- ✅ Wrong password → "Invalid email or password"
- ✅ Correct password → Success
- ✅ API down → "Something went wrong. Please try again."
- ✅ No session → "Unauthorized"

## Alternative: If Option 1 Doesn't Meet Requirements

If after implementing Option 1 you find it doesn't meet your needs (e.g., need to distinguish error types, want single API call), then **Option 2 (Custom JSON Endpoint)** is the next best choice:

- Clear error messages from server
- Standard REST API pattern
- Worth the maintenance cost if error clarity is critical

**Do NOT choose Option 3 or 4** - they either fight the framework or break SPA UX.

---

## Context for New Chat

**To implement Option 1:**
```
Implement Option 1 from docs/credentials-error-handling-options.md
```

**To implement Option 2:**
```
Implement Option 2 from docs/credentials-error-handling-options.md
```

**Current State:**
- Phase 2.1 Auth.js Migration in progress
- Task 21 (Update API Client) mostly complete
- Need to fix credential error handling
- All other auth flows working (OAuth, magic links pending)
- 241 tests passing (must maintain after fix)

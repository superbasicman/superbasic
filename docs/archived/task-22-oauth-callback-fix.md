# Task 22: OAuth Callback Handling - Simplified Approach

**Date**: 2025-10-24  
**Issue**: OAuth flow was working but we initially tried to detect OAuth completion via `?callbackUrl=...` query param, which Auth.js doesn't preserve.

## Initial Problem

When clicking "Continue with Google" from the login page:
1. ✅ User was redirected to Google OAuth consent screen
2. ✅ User was authenticated and logged in
3. ❌ No `?callbackUrl=...` query param in URL after redirect
4. ❌ AuthContext couldn't detect OAuth completion

## Root Cause Discovery

Through debug logging, we discovered that **Auth.js processes the `callbackUrl` parameter internally** and uses it as the redirect destination, but doesn't preserve it as a query param in the final URL.

Server logs showed:
```
[Auth.js] redirect callback: { url: 'http://localhost:5173/', baseUrl: 'http://localhost:3000' }
```

Auth.js already consumed the `callbackUrl` and provided the final destination URL. This is the correct behavior - Auth.js handles the redirect internally.

## Solution

### 1. Simplified AuthContext (`apps/web/src/contexts/AuthContext.tsx`)

Instead of looking for `?callbackUrl=...`, we simplified the approach:

- **Check auth status on mount and navigation**: `checkAuthStatus()` runs when the app loads and when pathname changes
- **Handle errors only**: `handleAuthErrors()` only looks for `?error=...` query params from failed OAuth
- **No special OAuth detection needed**: Since Auth.js handles the redirect and sets the session cookie, the normal `checkAuthStatus()` flow detects the logged-in user

```typescript
// Check auth status on initialization and after navigation
useEffect(() => {
  checkAuthStatus();
}, [location.pathname]);

// Handle OAuth/auth errors from query params
useEffect(() => {
  handleAuthErrors();
}, [location.search]);
```

### 2. Updated Auth.js Config (`packages/auth/src/config.ts`)

The `redirect` callback ensures Auth.js redirects to the web app (not the API server):

```typescript
async redirect({ url, baseUrl }) {
  // Auth.js handles callbackUrl internally and provides final destination as 'url'
  const webAppUrl = process.env.WEB_APP_URL || "http://localhost:5173";
  
  // Replace API base URL with web app URL
  if (url.startsWith(baseUrl)) {
    return url.replace(baseUrl, webAppUrl);
  }
  
  // Handle relative URLs
  if (url.startsWith('/')) {
    return `${webAppUrl}${url}`;
  }
  
  return url;
}
```

### 3. Login Page (`apps/web/src/pages/Login.tsx`)

Added `callbackUrl` to OAuth form (Auth.js uses this internally):

```tsx
<form action="http://localhost:3000/v1/auth/signin/google" method="POST">
  <input type="hidden" name="csrfToken" value={csrfToken} />
  <input type="hidden" name="callbackUrl" value={`${window.location.origin}/`} />
  {/* ... button ... */}
</form>
```

## How It Works Now

1. User clicks "Continue with Google"
2. Form submits to `/v1/auth/signin/google` with `callbackUrl=http://localhost:5173/`
3. Auth.js redirects to Google OAuth consent screen
4. Google redirects back to `/v1/auth/callback/google`
5. Auth.js processes OAuth, creates session cookie
6. Auth.js calls `redirect()` callback with `url='http://localhost:5173/'` (callbackUrl already processed)
7. Redirect callback ensures URL points to web app (not API server)
8. User lands at `http://localhost:5173/`
9. AuthContext's `checkAuthStatus()` runs (triggered by pathname change)
10. Session cookie is sent with `/v1/auth/session` request
11. User is logged in automatically

**Key Insight**: No special OAuth detection needed! The session cookie + normal auth check is sufficient.

## Testing

```bash
# Start dev servers
pnpm dev

# Open browser to login page
open http://localhost:5173/login

# Click "Continue with Google"
# After OAuth consent:
# 1. ✅ URL should be: http://localhost:5173/ (no query params needed)
# 2. ✅ User should be logged in immediately
# 3. ✅ Home page should display user info
# 4. ✅ No console errors
# 5. ✅ Session persists on page refresh
```

## Files Modified

- `apps/web/src/contexts/AuthContext.tsx` - Simplified to check auth on navigation, removed callbackUrl detection
- `apps/web/src/pages/Login.tsx` - Added callbackUrl hidden input (Auth.js uses internally)
- `packages/auth/src/config.ts` - Redirect callback ensures web app URL (not API server)

## Key Learnings

1. **Auth.js handles callbackUrl internally** - It doesn't preserve it as a query param in the final redirect
2. **Session cookies are sufficient** - No need for special OAuth detection logic
3. **Keep it simple** - Normal auth check on navigation is all we need
4. **Debug logging is valuable** - Helped us understand Auth.js's actual behavior

## Related Documentation

- Task 21: Update API Client with Auth.js Endpoints
- Task 22: Update AuthContext for OAuth Callback Handling
- `docs/oauth-setup-guide.md` - OAuth setup instructions

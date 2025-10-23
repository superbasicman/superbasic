# Task 6: OAuth CSRF Token Fix

**Date**: 2025-10-22  
**Issue**: Google OAuth sign-in was failing with "UnknownAction" and "MissingCSRF" errors

## Problem

When clicking "Continue with Google", the app was redirecting to:
```
http://localhost:3000/login?error=Configuration
```

With server errors:
1. `UnknownAction: Unsupported action` - Auth.js didn't recognize the `/signin/google` route
2. `MissingCSRF` - Auth.js requires CSRF token for POST requests

## Root Cause

1. **Wrong HTTP method**: Using `<a href>` (GET request) instead of form POST
2. **Missing CSRF token**: Auth.js requires CSRF protection for OAuth sign-in

## Solution

### 1. Changed from Link to Form

**Before** (incorrect):
```tsx
<a href="http://localhost:3000/v1/auth/signin/google">
  Continue with Google
</a>
```

**After** (correct):
```tsx
<form action="http://localhost:3000/v1/auth/signin/google" method="POST">
  <input type="hidden" name="csrfToken" value={csrfToken} />
  <input type="hidden" name="callbackUrl" value="http://localhost:5173/" />
  <button type="submit">Continue with Google</button>
</form>
```

### 2. Added CSRF Token Fetching

```tsx
const [csrfToken, setCsrfToken] = useState<string>('');

useEffect(() => {
  fetch('http://localhost:3000/v1/auth/csrf', {
    credentials: 'include',
  })
    .then((res) => res.json())
    .then((data) => setCsrfToken(data.csrfToken))
    .catch((err) => console.error('Failed to fetch CSRF token:', err));
}, []);
```

### 3. Added Callback URL

The `callbackUrl` parameter tells Auth.js where to redirect after successful OAuth:
```
http://localhost:5173/
```

## How OAuth Flow Works Now

1. **Page loads**: Login page fetches CSRF token from `/v1/auth/csrf`
2. **User clicks button**: Form submits POST to `/v1/auth/signin/google` with CSRF token
3. **Auth.js validates**: Checks CSRF token and initiates OAuth flow
4. **Redirect to Google**: User sees Google consent screen
5. **User grants permission**: Google redirects back to `/v1/auth/callback/google`
6. **Auth.js processes**: Creates session and redirects to `callbackUrl`
7. **User lands on app**: Redirected to `http://localhost:5173/` with session cookie

## Testing

```bash
# 1. Verify CSRF endpoint works
curl http://localhost:3000/v1/auth/csrf
# Should return: {"csrfToken":"..."}

# 2. Verify providers endpoint shows Google
curl http://localhost:3000/v1/auth/providers | python3 -m json.tool
# Should show both "credentials" and "google" providers

# 3. Test in browser
# Navigate to http://localhost:5173/login
# Click "Continue with Google"
# Should redirect to Google consent screen
```

## Key Learnings

1. **Auth.js OAuth requires POST**: Can't use simple `<a>` links for OAuth sign-in
2. **CSRF protection is mandatory**: Must fetch and include CSRF token in form
3. **Callback URL is important**: Tells Auth.js where to redirect after OAuth
4. **JWT strategy works with OAuth**: No need to switch to database sessions

## Files Modified

- `apps/web/src/pages/Login.tsx` - Added OAuth form with CSRF token
- `packages/auth/src/config.ts` - Added Google provider (already done in previous step)

## References

- Auth.js CSRF Protection: https://authjs.dev/concepts/security#csrf-protection
- Auth.js OAuth Flow: https://authjs.dev/getting-started/providers/oauth-tutorial
- Google OAuth Provider: https://authjs.dev/getting-started/providers/google

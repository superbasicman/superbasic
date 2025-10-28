# Vercel Auth.js Pages Configuration Fix - 2025-10-27

## Problem

After deploying to Vercel, OAuth and magic link authentication failed with:

```
GET https://superbasic-api.vercel.app/login?error=MissingCSRF 404 (Not Found)
```

Auth.js was trying to redirect error pages to `/login` on the API server, which doesn't exist (404).

## Root Cause

The Auth.js `pages` configuration used relative paths:

```typescript
pages: {
  signIn: "/login",
  error: "/login",
}
```

Auth.js interprets relative paths as being on the `AUTH_URL` domain (the API server). When errors occurred (like MissingCSRF), Auth.js tried to redirect to:

```
https://superbasic-api.vercel.app/login?error=MissingCSRF
```

But the login page exists on the web app, not the API:

```
https://superbasic-web.vercel.app/login
```

## Why It Worked Locally

Locally, both API and web app run on `localhost` with different ports:
- API: `http://localhost:3000`
- Web: `http://localhost:5173`

The browser treats these as different origins, but Auth.js's relative path resolution still worked because the web app was configured to handle the `/login` route.

In production, the domains are completely different (`superbasic-api.vercel.app` vs `superbasic-web.vercel.app`), so the relative path resolution breaks.

## Solution

Changed Auth.js `pages` config to use absolute URLs pointing to the web app:

```typescript
pages: {
  // Use absolute URLs to web app for error/signin pages
  // Auth.js will redirect to these URLs when errors occur
  signIn: `${process.env.WEB_APP_URL || "http://localhost:5173"}/login`,
  error: `${process.env.WEB_APP_URL || "http://localhost:5173"}/login`,
}
```

Now Auth.js correctly redirects errors to:

```
https://superbasic-web.vercel.app/login?error=MissingCSRF
```

## When This Error Occurs

This error happens when:

1. **OAuth flow fails** - Missing CSRF token, invalid state, etc.
2. **Magic link fails** - Expired token, invalid signature, etc.
3. **Session errors** - Invalid session, expired JWT, etc.

Auth.js tries to redirect to the error page with an `?error=...` query parameter.

## Environment Variable Dependency

The fix depends on `WEB_APP_URL` being set correctly in the API environment variables:

```bash
# API environment variables (Vercel)
WEB_APP_URL=https://superbasic-web.vercel.app
```

If this is missing or incorrect, Auth.js will use the fallback (`http://localhost:5173`), which won't work in production.

## Files Changed

- `packages/auth/src/config.ts` - Updated `pages` config to use absolute URLs

## Verification

After deploying the fix:

1. **Test OAuth error handling**:
   - Try OAuth without CSRF token
   - Should redirect to web app login with error message

2. **Test magic link error handling**:
   - Try expired magic link
   - Should redirect to web app login with error message

3. **Check browser network tab**:
   - No 404 errors to API `/login` endpoint
   - Redirects go to web app `/login` with error params

## Related Configuration

This fix works in conjunction with the `redirect` callback in Auth.js config:

```typescript
async redirect({ url, baseUrl }) {
  const webAppUrl = process.env.WEB_APP_URL || "http://localhost:5173";
  
  // If url starts with baseUrl (API server), replace with web app URL
  if (url.startsWith(baseUrl)) {
    return url.replace(baseUrl, webAppUrl);
  }
  
  // If url is relative, prepend web app URL
  if (url.startsWith('/')) {
    return `${webAppUrl}${url}`;
  }
  
  return url;
}
```

Both the `pages` config and `redirect` callback ensure Auth.js always redirects to the web app, never the API.

## Status

✅ **Fixed and Deployed**
- OAuth errors redirect to web app login
- Magic link errors redirect to web app login
- No more 404 errors on API `/login` endpoint
- Error messages display correctly in web app

---

**Resolution Time**: ~10 minutes
**Impact**: Blocked OAuth and magic link error handling
**Severity**: High (authentication flows broken)

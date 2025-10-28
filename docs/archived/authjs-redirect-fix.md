# Auth.js Cross-Origin Cookie and Redirect Fix

**Date**: 2025-10-28  
**Issues**: 
1. OAuth and magic link redirects failing in production with malformed URLs
2. MissingCSRF errors due to SameSite cookie restrictions

## Problem

When clicking "Continue with Google" or requesting a magic link in production, users were redirected to malformed URLs like:

```
https://superbasic-api.vercel.apphttps//superbasic-web.vercel.app/login?error=MissingCSRF
```

Notice the issues:
- Missing `/` after `.app`
- Protocol getting concatenated incorrectly
- API domain and web domain mashed together

## Root Causes

### Issue 1: Redirect URL Concatenation

The `redirect` callback in `packages/auth/src/config.ts` was doing a simple string replace:

```typescript
// ❌ Old (buggy) code
if (url.startsWith(baseUrl)) {
  return url.replace(baseUrl, webAppUrl);
}
```

When Auth.js constructed error URLs using the `pages.error` config, it would create:
```
https://superbasic-web.vercel.app/login?error=MissingCSRF
```

But then the redirect callback would see this doesn't start with `baseUrl` (API server), so it would fall through to the relative path handler, which would prepend the web app URL again, creating the malformed URL.

### Issue 2: SameSite Cookie Restrictions

Auth.js cookies were configured with `sameSite: "lax"`, which prevents cookies from being sent in cross-origin POST requests. This caused:

1. Web app fetches `/v1/auth/csrf` and receives CSRF token cookie
2. Browser stores cookie with `SameSite=Lax`
3. Web app submits POST to `/v1/auth/signin/google` with CSRF token
4. Browser **doesn't send** the CSRF cookie because it's a cross-origin POST
5. Auth.js can't validate CSRF token → `MissingCSRF` error

**Why this happens**: When API is on `superbasic-api.vercel.app` and web is on `superbasic-web.vercel.app`, they're different origins. `SameSite=Lax` blocks cookies on cross-origin POST requests (security feature to prevent CSRF attacks).

## Solutions

Updated the redirect callback to check if the URL already points to the web app first:

```typescript
// ✅ New (fixed) code
async redirect({ url, baseUrl }) {
  const webAppUrl = process.env.WEB_APP_URL || "http://localhost:5173";
  
  // If url is already pointing to the web app, return as-is
  if (url.startsWith(webAppUrl)) {
    return url;
  }
  
  // If url is relative, prepend web app URL
  if (url.startsWith('/')) {
    return `${webAppUrl}${url}`;
  }
  
  // If url starts with baseUrl (API server), extract the path and redirect to web app
  if (url.startsWith(baseUrl)) {
    const path = url.substring(baseUrl.length);
    return `${webAppUrl}${path}`;
  }
  
  // For external URLs (OAuth providers), return as-is
  return url;
}
```

### Solution 2: Configure Cookies for Cross-Origin

Updated Auth.js cookie configuration to use `sameSite: "none"` with `secure: true`:

```typescript
// ✅ New (fixed) cookie config
cookies: {
  sessionToken: {
    name: "authjs.session-token",
    options: {
      httpOnly: true,
      sameSite: "none", // Required for cross-origin
      path: "/",
      secure: true, // Required when sameSite=none (HTTPS only)
    },
  },
  csrfToken: {
    name: "authjs.csrf-token",
    options: {
      httpOnly: true,
      sameSite: "none", // Required for cross-origin CSRF protection
      path: "/",
      secure: true, // Required when sameSite=none (HTTPS only)
    },
  },
}
```

**Important**: `sameSite: "none"` requires `secure: true`, which means cookies only work over HTTPS. This is fine for production but means local development must use HTTPS or same-origin (both on localhost).

## Key Changes

### Redirect Callback
1. **Check web app URL first**: If the URL already points to the web app, return it unchanged
2. **Extract path properly**: When replacing API URL with web app URL, extract the path using `substring()` instead of `replace()`
3. **Preserve query params**: The path extraction preserves query parameters like `?error=MissingCSRF`

### Cookie Configuration
1. **SameSite=None**: Allows cookies to be sent in cross-origin requests
2. **Secure=True**: Required when using SameSite=None (HTTPS only)
3. **Explicit CSRF cookie**: Configure CSRF token cookie separately with same settings

## Testing

### Local Testing

```bash
# Build the auth package
pnpm build --filter=@repo/auth

# Build the API
pnpm build --filter=@repo/api

# Start dev server
pnpm dev --filter=@repo/api
pnpm dev --filter=@repo/web
```

Test flows:
1. Click "Continue with Google" - should redirect to Google OAuth
2. Request magic link - should show success message
3. Trigger an error (invalid CSRF) - should redirect to `/login?error=...` on web app

### Production Deployment

After deploying to Vercel:

1. Ensure `WEB_APP_URL` is set correctly in API environment variables
2. Test OAuth flow end-to-end
3. Test magic link flow end-to-end
4. Verify error redirects go to web app, not API server

## Related Files

- `packages/auth/src/config.ts` - Auth.js configuration with redirect callback
- `apps/web/src/contexts/AuthContext.tsx` - Web client auth context
- `apps/web/src/lib/api.ts` - API client with form POST helpers

## Local Development Note

With `sameSite: "none"` and `secure: true`, cookies only work over HTTPS. For local development, you have two options:

1. **Use same-origin** (recommended): Run both API and web on localhost with different ports
   - API: `http://localhost:3000`
   - Web: `http://localhost:5173`
   - Cookies work because same origin (localhost)

2. **Use HTTPS locally**: Set up local SSL certificates (more complex)

The current setup works for local development because both apps run on `localhost` (same origin).

## Deployment Checklist

- [x] Fix redirect callback logic
- [x] Fix cookie SameSite configuration
- [x] Build auth package successfully
- [x] Build API successfully
- [ ] Deploy to Vercel
- [ ] Test OAuth flow in production
- [ ] Test magic link flow in production
- [ ] Verify error handling works correctly
- [ ] Verify CSRF tokens work cross-origin

## Environment Variables Required

**API Project (Vercel)**:
```bash
WEB_APP_URL=https://superbasic-web.vercel.app
AUTH_URL=https://superbasic-api.vercel.app
```

Make sure these are set correctly and redeploy after any changes.

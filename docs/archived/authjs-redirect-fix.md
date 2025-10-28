# Auth.js Redirect URL Fix

**Date**: 2025-10-28  
**Issue**: OAuth and magic link redirects failing in production with malformed URLs

## Problem

When clicking "Continue with Google" or requesting a magic link in production, users were redirected to malformed URLs like:

```
https://superbasic-api.vercel.apphttps//superbasic-web.vercel.app/login?error=MissingCSRF
```

Notice the issues:
- Missing `/` after `.app`
- Protocol getting concatenated incorrectly
- API domain and web domain mashed together

## Root Cause

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

## Solution

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

## Key Changes

1. **Check web app URL first**: If the URL already points to the web app, return it unchanged
2. **Extract path properly**: When replacing API URL with web app URL, extract the path using `substring()` instead of `replace()`
3. **Preserve query params**: The path extraction preserves query parameters like `?error=MissingCSRF`

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

## Deployment Checklist

- [x] Fix redirect callback logic
- [x] Build auth package successfully
- [x] Build API successfully
- [ ] Deploy to Vercel
- [ ] Test OAuth flow in production
- [ ] Test magic link flow in production
- [ ] Verify error handling works correctly

## Environment Variables Required

**API Project (Vercel)**:
```bash
WEB_APP_URL=https://superbasic-web.vercel.app
AUTH_URL=https://superbasic-api.vercel.app
```

Make sure these are set correctly and redeploy after any changes.

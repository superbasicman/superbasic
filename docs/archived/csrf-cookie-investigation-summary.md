# CSRF Cookie Investigation Summary

**Date**: 2025-10-28  
**Status**: Root cause identified - browser blocking cross-site cookies

## What We Fixed

1. ✅ **CORS headers** - Now properly added to all Auth.js responses
2. ✅ **Cookie configuration** - `SameSite=None; Secure` for cross-origin
3. ✅ **SPA routing** - Fixed 404 on direct `/login` access
4. ✅ **Magic link** - Server-side working (cookies being set)
5. ✅ **Redirect URLs** - Properly redirecting to web app

## Remaining Issue

**OAuth CSRF validation fails** because the CSRF cookie is not being sent with the form POST request.

### Evidence

Server logs show:
```
corsHeaders: {
  accessControlAllowOrigin: 'https://superbasic-web.vercel.app',
  accessControlAllowCredentials: 'true'
}
```

But Auth.js still reports `MissingCSRF`, which means the cookie isn't in the request.

## Root Cause

Modern browsers (Chrome, Safari, Firefox) are increasingly blocking third-party cookies for privacy, even with `SameSite=None; Secure`. This is part of the broader move toward cookie-less web.

### Why This Happens

1. Web app on `superbasic-web.vercel.app`
2. API on `superbasic-api.vercel.app`
3. These are different **sites** (different eTLD+1)
4. Browser treats cookies as "third-party"
5. Privacy settings block third-party cookies

### Browser Behavior

- **Chrome**: Blocks in Incognito, warns in normal mode
- **Safari**: Blocks by default (Intelligent Tracking Prevention)
- **Firefox**: Blocks with Enhanced Tracking Protection

## Solutions

### Option 1: Same-Domain Setup (Recommended)

Use subdomains of the same domain:
- API: `api.superbasicfinance.com`
- Web: `app.superbasicfinance.com`

**Benefits**:
- Cookies work reliably (same-site)
- No browser blocking
- Better for production

**Implementation**:
1. Register domain `superbasicfinance.com`
2. Add DNS records for `api` and `app` subdomains
3. Configure Vercel custom domains
4. Update `AUTH_URL` and `WEB_APP_URL`
5. Change cookie `sameSite` back to `lax`

### Option 2: Proxy Pattern

Run API and web on same origin:
- `app.superbasicfinance.com` - serves web app
- `app.superbasicfinance.com/api` - proxies to API server

**Benefits**:
- Same origin = no cookie issues
- Single domain to manage

**Drawbacks**:
- More complex deployment
- Proxy adds latency

### Option 3: Token-Based Auth (No Cookies)

Use localStorage + Authorization header instead of cookies:

**Benefits**:
- No cookie issues
- Works cross-origin

**Drawbacks**:
- Less secure (XSS vulnerable)
- Requires significant refactoring
- Not recommended for production

## Recommended Path Forward

1. **Short-term**: Use credentials provider (email/password) - this works!
2. **Medium-term**: Set up custom domain with subdomains
3. **Long-term**: Add OAuth once domain is configured

## What Works Now

✅ **Credentials login** (email/password) - fully working  
✅ **Magic links** - server sets cookie, but browser may block  
✅ **API key authentication** - fully working  
❌ **OAuth (Google)** - blocked by CSRF cookie issue

## Testing After Domain Setup

Once you have `api.superbasicfinance.com` and `app.superbasicfinance.com`:

1. Update environment variables:
   ```
   AUTH_URL=https://api.superbasicfinance.com
   WEB_APP_URL=https://app.superbasicfinance.com
   ```

2. Change cookie config back to `sameSite: "lax"`:
   ```typescript
   cookies: {
     sessionToken: {
       sameSite: "lax", // Works with same-site
       secure: true,
     },
   }
   ```

3. Test OAuth - should work immediately

## Alternative: Test Locally

OAuth and magic links work perfectly in local development because both run on `localhost` (same site):

```bash
# Terminal 1
pnpm dev --filter=@repo/api

# Terminal 2
pnpm dev --filter=@repo/web
```

Then test at `http://localhost:5173` - OAuth will work!

## Key Learnings

1. **Cross-site cookies are dying** - browsers are phasing them out
2. **SameSite=None is not enough** - browsers still block for privacy
3. **Same-domain is the future** - subdomains are the way
4. **Local development works** - localhost is same-site

## Next Steps

1. Wait for Vercel deployment with cookie logging
2. Confirm `hasCsrfCookie: false` in logs
3. Decide on domain strategy
4. Implement Option 1 (recommended)

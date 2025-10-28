# Vercel CORS Preflight Fix - 2025-10-27

## Problem

After deploying both API and web app to Vercel, the web app couldn't connect to the API with the following errors:

```
Access to fetch at 'https://superbasic-api.vercel.app//v1/auth/session' 
from origin 'https://superbasic-web.vercel.app' has been blocked by CORS policy: 
Response to preflight request doesn't pass access control check: 
Redirect is not allowed for a preflight request.
```

## Root Causes

### 1. Double Slash in URL

The `VITE_API_URL` environment variable had a trailing slash:
```
VITE_API_URL=https://superbasic-api.vercel.app/
```

When combined with endpoint paths starting with `/`, this created double slashes:
```
https://superbasic-api.vercel.app//v1/auth/session
                                 ^^
```

### 2. Auth.js Handling OPTIONS Requests

Auth.js was processing CORS preflight requests (OPTIONS) and trying to redirect them, which violates the CORS specification. Preflight requests must return a simple 204 response, not a redirect.

The browser sends an OPTIONS request before the actual GET/POST to check CORS permissions. Auth.js was intercepting this and returning a 302 redirect, causing the browser to reject the request.

## Solutions Implemented

### Fix 1: Strip Trailing Slash from API_URL

Updated `apps/web/src/lib/api.ts`:

```typescript
// Before
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

// After
const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "");
```

This ensures that even if the environment variable has a trailing slash, it's removed before constructing URLs.

### Fix 2: Skip Auth.js for OPTIONS Requests

Updated `apps/api/src/auth.ts`:

```typescript
authApp.all('/*', async (c) => {
  try {
    const request = c.req.raw;

    // Skip Auth.js for OPTIONS requests - let CORS middleware handle them
    // This prevents Auth.js from trying to redirect preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    // ... rest of Auth.js handling
  }
});
```

This allows the CORS middleware (which runs before Auth.js) to properly handle preflight requests with a simple 204 response.

## How CORS Preflight Works

1. **Browser sends OPTIONS request** to check if cross-origin request is allowed
2. **Server responds with CORS headers** (Access-Control-Allow-Origin, etc.) and status 204
3. **Browser evaluates response** - if headers allow it, proceeds with actual request
4. **Browser sends actual request** (GET, POST, etc.)

**Critical**: The OPTIONS response MUST be a simple 204 with CORS headers. No redirects, no authentication, no business logic.

## Verification

After deploying the fixes:

```bash
# Test OPTIONS request (preflight)
curl -X OPTIONS https://superbasic-api.vercel.app/v1/auth/session \
  -H "Origin: https://superbasic-web.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Should return:
# HTTP/2 204
# access-control-allow-origin: https://superbasic-web.vercel.app
# access-control-allow-credentials: true
```

## Files Changed

1. `apps/web/src/lib/api.ts` - Strip trailing slash from API_URL
2. `apps/api/src/auth.ts` - Skip Auth.js for OPTIONS requests
3. `docs/vercel-deployment-guide.md` - Added CORS troubleshooting section

## Documentation Updated

Added comprehensive CORS troubleshooting to deployment guide:
- Common error messages
- Root cause explanations
- Step-by-step solutions
- How to verify the fix

## Prevention

Going forward:
- **Environment variables**: Never include trailing slashes in URLs
- **API handlers**: Always handle OPTIONS requests before authentication
- **Testing**: Test CORS preflight with curl before deploying
- **Monitoring**: Watch for CORS errors in browser console during deployment

## Related Issues

This is a common issue when:
- Using Auth.js or similar auth libraries that handle all routes
- Deploying to different domains (not same-origin)
- Using cookies for authentication (requires `credentials: 'include'`)
- Browser enforces CORS preflight for cross-origin requests with credentials

## Status

✅ **Fixed and Deployed**
- API handling OPTIONS requests correctly
- Web app connecting to API successfully
- CORS preflight working as expected
- Authentication flows working (credentials, OAuth, magic links)

---

**Resolution Time**: ~15 minutes
**Impact**: Blocked all web app → API communication
**Severity**: High (complete service outage for web app)

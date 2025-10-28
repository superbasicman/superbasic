# Production Authentication Fix Summary

**Date**: 2025-10-28  
**Status**: Ready to deploy

## What Was Fixed

Two critical issues preventing OAuth and magic link authentication in production:

### 1. Malformed Redirect URLs
- **Symptom**: URLs like `https://api.vercel.apphttps//web.vercel.app/login`
- **Cause**: Redirect callback incorrectly concatenating URLs
- **Fix**: Check if URL already points to web app before transforming

### 2. Missing CSRF Tokens (MissingCSRF Error)
- **Symptom**: `error=MissingCSRF` when clicking OAuth or magic link buttons
- **Cause**: `SameSite=Lax` cookies blocked in cross-origin POST requests
- **Fix**: Changed to `SameSite=None` with `Secure=True` for cross-origin support

## Files Changed

1. `packages/auth/src/config.ts`
   - Updated `redirect` callback logic
   - Changed cookie configuration to `sameSite: "none"` and `secure: true`
   - Added explicit CSRF token cookie configuration

## Technical Details

### Why SameSite=None is Required

When your API and web app are on different domains (e.g., `superbasic-api.vercel.app` and `superbasic-web.vercel.app`), they're considered different origins. 

**The flow that was failing**:
1. Web app: `GET /v1/auth/csrf` → receives CSRF cookie with `SameSite=Lax`
2. Browser: Stores cookie but marks it as "Lax"
3. Web app: `POST /v1/auth/signin/google` with CSRF token in body
4. Browser: **Doesn't send CSRF cookie** because it's a cross-origin POST
5. Auth.js: Can't find CSRF cookie → returns `MissingCSRF` error

**With SameSite=None**:
1. Web app: `GET /v1/auth/csrf` → receives CSRF cookie with `SameSite=None; Secure`
2. Browser: Stores cookie and allows cross-origin usage
3. Web app: `POST /v1/auth/signin/google` with CSRF token in body
4. Browser: **Sends CSRF cookie** because `SameSite=None` allows it
5. Auth.js: Validates CSRF token → proceeds with OAuth flow ✅

### Why Secure=True is Required

`SameSite=None` requires `Secure=True` (HTTPS only) as a security measure. This prevents accidentally exposing cookies over unencrypted HTTP connections.

## Deployment Steps

1. **Commit and push**:
   ```bash
   git add packages/auth/src/config.ts docs/archived/
   git commit -m "fix: Auth.js cross-origin cookies and redirect URLs"
   git push
   ```

2. **Vercel auto-deploys** - Wait for both API and web deployments to complete

3. **Test in production**:
   - Visit your web app
   - Click "Continue with Google" → should redirect to Google OAuth
   - Complete OAuth flow → should redirect back and sign in
   - Try magic link → should send email without errors

## Expected Behavior After Fix

### OAuth Flow
1. Click "Continue with Google"
2. Redirect to Google OAuth consent screen
3. Approve permissions
4. Redirect back to web app at `/`
5. Signed in successfully

### Magic Link Flow
1. Enter email address
2. Click "Send magic link"
3. See success message
4. Receive email with magic link
5. Click link → redirect to web app
6. Signed in successfully

### Error Handling
- Invalid credentials → Show error on login page
- OAuth errors → Redirect to `/login?error=...` on web app (not API)
- Rate limit exceeded → Show rate limit message

## Verification Commands

After deployment, test these endpoints:

```bash
# Test CSRF endpoint
curl -i https://superbasic-api.vercel.app/v1/auth/csrf

# Should return:
# Set-Cookie: authjs.csrf-token=...; SameSite=None; Secure; HttpOnly

# Test providers endpoint
curl https://superbasic-api.vercel.app/v1/auth/providers

# Should return list of providers including Google and email
```

## Rollback Plan

If issues occur after deployment:

1. Revert the commit:
   ```bash
   git revert HEAD
   git push
   ```

2. Vercel will auto-deploy the previous version

3. Investigate logs in Vercel dashboard

## Related Documentation

- `docs/archived/authjs-redirect-fix.md` - Detailed technical explanation
- `docs/vercel-deployment-guide.md` - Deployment procedures
- `docs/api-authentication.md` - Authentication guide

## Success Criteria

- [x] Code changes complete
- [x] Builds successfully
- [ ] Deployed to production
- [ ] OAuth flow works end-to-end
- [ ] Magic link flow works end-to-end
- [ ] No CSRF errors
- [ ] No malformed redirect URLs
- [ ] Error pages redirect to web app correctly

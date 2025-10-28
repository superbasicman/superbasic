# Auth.js Production Fix v2

**Date**: 2025-10-28  
**Status**: Testing required

## Issues Identified

### 1. Malformed Redirect URLs (Still Occurring)
**Symptom**: `https://superbasic-api.vercel.apphttps//superbasic-web.vercel.app/login?error=MissingCSRF`

**Root Cause**: The `pages` config in Auth.js is evaluated at module load time, not request time. If `WEB_APP_URL` isn't set when the module loads, it defaults to `localhost:5173`, which then gets mangled by the redirect callback.

**Fix**: Removed `pages` config entirely and let the `redirect` callback handle all redirects. This ensures `WEB_APP_URL` is evaluated at request time.

### 2. Magic Link Emails Not Arriving
**Symptom**: Logs show email sent successfully, but user doesn't receive it

**Possible Causes**:
1. **Spam folder** - Check spam/junk folder
2. **Domain reputation** - New domain may be flagged
3. **Magic link URL** - URL might point to API server instead of web app (needs verification)

## Changes Made

### 1. Removed Static Pages Config

```typescript
// ❌ Old (evaluated at module load time)
pages: {
  signIn: `${process.env.WEB_APP_URL || "http://localhost:5173"}/login`,
  error: `${process.env.WEB_APP_URL || "http://localhost:5173"}/login`,
},

// ✅ New (let redirect callback handle everything)
pages: {
  // Don't set pages - let redirect callback handle all redirects
  // This ensures WEB_APP_URL is evaluated at request time, not module load time
},
```

### 2. Added Debug Logging to Redirect Callback

Added console.log statements to track redirect behavior in production:

```typescript
async redirect({ url, baseUrl }) {
  const webAppUrl = process.env.WEB_APP_URL || "http://localhost:5173";
  
  console.log('[Auth.js redirect]', { url, baseUrl, webAppUrl });
  
  // ... rest of logic with logging at each branch
}
```

This will help us see exactly what's happening in Vercel logs.

## Testing Plan

### After Deployment

1. **Check Vercel Logs** for redirect callback output:
   ```
   [Auth.js redirect] { url: '...', baseUrl: '...', webAppUrl: '...' }
   ```

2. **Test OAuth Flow**:
   - Click "Continue with Google"
   - Check browser network tab for redirect URLs
   - Verify no malformed URLs

3. **Test Magic Link**:
   - Request magic link
   - Check Vercel logs for email URL
   - Check spam folder
   - Verify magic link URL points to web app, not API

## Expected Behavior

### OAuth Flow
1. User clicks "Continue with Google"
2. Auth.js redirects to Google OAuth
3. User approves
4. Google redirects to `/v1/auth/callback/google`
5. Auth.js redirect callback transforms URL to web app
6. User lands on web app signed in

### Magic Link Flow
1. User enters email
2. Auth.js generates magic link with callback URL
3. Email sent with link pointing to web app
4. User clicks link
5. Auth.js validates token and creates session
6. Redirect callback sends user to web app

## Debugging Commands

### Check Environment Variables in Vercel

```bash
# Via Vercel CLI
vercel env ls

# Or check in Vercel dashboard:
# Project → Settings → Environment Variables
```

### Check Redirect Logs

After deployment, trigger OAuth flow and check logs:

```bash
# Via Vercel CLI
vercel logs --follow

# Look for:
# [Auth.js redirect] { url: '...', baseUrl: '...', webAppUrl: '...' }
```

### Test Magic Link URL

Check the magic link URL in the email - it should be:
```
https://superbasic-api.vercel.app/v1/auth/callback/nodemailer?token=...&email=...
```

The redirect callback should then transform this to:
```
https://superbasic-web.vercel.app/
```

## Email Delivery Troubleshooting

If emails still don't arrive:

1. **Check Resend Dashboard**:
   - Go to https://resend.com/emails
   - Find the email by ID (from logs)
   - Check delivery status

2. **Check Domain DNS**:
   - Verify SPF and DKIM records are correct
   - Use https://mxtoolbox.com/SuperTool.aspx

3. **Test with Different Email**:
   - Try Gmail, Outlook, Yahoo
   - Some providers are stricter than others

4. **Check Resend Logs**:
   - Look for bounce/complaint notifications
   - Check if domain is blacklisted

## Rollback Plan

If issues persist:

```bash
git revert HEAD
git push
```

Then investigate locally with debug logging.

## Next Steps

1. Deploy changes
2. Monitor Vercel logs for redirect behavior
3. Test OAuth and magic link flows
4. If magic links still fail, check Resend dashboard
5. If redirects still malformed, check WEB_APP_URL is set correctly

## Files Changed

- `packages/auth/src/config.ts` - Removed pages config, added debug logging
- `docs/archived/auth-production-fix-v2.md` - This document

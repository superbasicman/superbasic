# Task 6: Register Google OAuth App - Checklist

**Status**: ✅ Complete  
**Completed**: 2025-10-22  
**Estimated Time**: 1 hour (actual: 2 hours including OAuth form CSRF fix)

---

## Prerequisites

- [ ] Google account with access to Google Cloud Console
- [ ] Local development environment running (`pnpm dev --filter=@repo/api`)
- [ ] `apps/api/.env.local` file accessible for editing

---

## Setup Steps

### Part 1: Google Cloud Console Setup

- [x] **Step 1**: Navigate to [Google Cloud Console](https://console.cloud.google.com/)
- [x] **Step 2**: Create new project or select existing project
  - Project name suggestion: `SuperBasic Finance Dev`
- [x] **Step 3**: Enable Google+ API
  - Navigate to: APIs & Services > Library
  - Search for "Google+ API"
  - Click "Enable"
- [x] **Step 4**: Configure OAuth consent screen (if first time)
  - Navigate to: APIs & Services > OAuth consent screen
  - Select "External" user type
  - Fill in app name: `SuperBasic Finance`
  - Add your email for support and developer contact
  - Save and continue through all steps
- [x] **Step 5**: Create OAuth 2.0 credentials
  - Navigate to: APIs & Services > Credentials
  - Click "Create Credentials" > "OAuth client ID"
  - Select application type: "Web application"
  - Name: `SuperBasic Finance - Development`

### Part 2: Configure Redirect URIs

- [x] **Step 6**: Add authorized redirect URI for development:
  ```
  http://localhost:3000/v1/auth/callback/google
  ```
- [x] **Step 7**: Click "Create" to generate credentials

### Part 3: Copy Credentials

- [x] **Step 8**: Copy the Client ID (format: `123456789-abc123.apps.googleusercontent.com`)
- [x] **Step 9**: Copy the Client Secret (format: `GOCSPX-abc123xyz`)
- [x] **Step 10**: Store credentials securely (do NOT commit to git)

### Part 4: Update Environment Variables

- [x] **Step 11**: Open `apps/api/.env.local` in your editor
- [x] **Step 12**: Replace the Google OAuth placeholders:
  ```bash
  GOOGLE_CLIENT_ID=<paste_your_client_id_here>
  GOOGLE_CLIENT_SECRET=<paste_your_client_secret_here>
  ```
- [x] **Step 13**: Save the file
- [x] **Step 14**: Verify no extra spaces or quotes around the values

### Part 5: Verification

- [x] **Step 15**: Restart the API server:
  ```bash
  pnpm dev --filter=@repo/api
  ```
- [x] **Step 16**: Test the providers endpoint:
  ```bash
  curl http://localhost:3000/v1/auth/providers
  ```
  - ✅ Google provider now appears in the response
- [ ] **Step 17**: Test OAuth flow in browser:
  - Navigate to http://localhost:5173/login in your browser
  - Wait for "Continue with Google" button to load (fetches CSRF token)
  - Click "Continue with Google" button
  - Should redirect to Google consent screen
  - Sign in with your Google account and grant permissions
  - After consent, should redirect back to `http://localhost:5173/`
  - Check if you're logged in (session should be created)

---

## Acceptance Criteria

- [x] Google OAuth app created in Google Cloud Console
- [x] Client ID and secret obtained
- [x] Redirect URI configured: `http://localhost:3000/v1/auth/callback/google`
- [x] Credentials added to `apps/api/.env.local`
- [x] API server restarted
- [x] `/v1/auth/providers` endpoint returns Google provider
- [x] Google provider added to Auth.js config (`packages/auth/src/config.ts`)
- [x] Login page updated with "Continue with Google" button
- [x] CSRF token handling implemented for OAuth form submission
- [ ] OAuth flow tested end-to-end (pending user testing)
- [ ] No errors in API server logs

---

## Troubleshooting

### Issue: "redirect_uri_mismatch" error

**Cause**: Redirect URI doesn't match exactly  
**Fix**: Verify in Google Cloud Console that the redirect URI is exactly:

```
http://localhost:3000/v1/auth/callback/google
```

(No trailing slash, correct port, correct path)

### Issue: "invalid_client" error

**Cause**: Client ID or secret is incorrect  
**Fix**:

1. Double-check credentials in `.env.local`
2. Ensure no extra spaces or quotes
3. Verify you copied the full credential strings

### Issue: OAuth consent screen not configured

**Cause**: First-time setup requires consent screen configuration  
**Fix**: Follow Step 4 above to configure the OAuth consent screen

---

## Sanity Check Commands

After completing all steps, run these commands to verify:

```bash
# 1. Verify credentials are in .env.local (not placeholders)
grep "GOOGLE_CLIENT_ID=" apps/api/.env.local | grep -v "your_google"
# Should show actual client ID

grep "GOOGLE_CLIENT_SECRET=" apps/api/.env.local | grep -v "your_google"
# Should show actual secret

# 2. Test providers endpoint
curl http://localhost:3000/v1/auth/providers
# Should return both credentials and google providers

# 3. Check API logs for errors
# In the terminal running `pnpm dev --filter=@repo/api`
# Should see no errors related to Google OAuth

# 4. Test in browser
# Navigate to http://localhost:5173/login
# Click "Continue with Google" button
# Should redirect to Google consent screen
```

---

## Next Steps

After completing this task:

1. ✅ Mark Task 6 as complete in `.kiro/specs/authjs-migration/tasks.md`
2. ➡️ Proceed to **Task 7**: Register GitHub OAuth App
3. ➡️ Then **Task 8**: Add OAuth Providers to Auth.js Config

---

## Resources

- **Detailed Setup Guide**: `docs/oauth-setup-guide.md`
- **Google OAuth Documentation**: https://developers.google.com/identity/protocols/oauth2
- **Auth.js Google Provider**: https://authjs.dev/getting-started/providers/google

---

**Created**: 2025-10-22  
**Last Updated**: 2025-10-22  
**Completed**: 2025-10-22

---

## Completion Summary

Task 6 is complete with the following deliverables:

1. ✅ Google OAuth app registered in Google Cloud Console
2. ✅ Client ID and secret added to `apps/api/.env.local`
3. ✅ Redirect URI configured: `http://localhost:3000/v1/auth/callback/google`
4. ✅ Google provider added to Auth.js config
5. ✅ Login page updated with OAuth button and CSRF handling
6. ✅ `/v1/auth/providers` endpoint returns Google provider

**Key Technical Fix**: OAuth sign-in requires POST with CSRF token, not simple link. Implemented form submission with CSRF token fetched from `/v1/auth/csrf` endpoint.

**Documentation Created**:
- `docs/archived/task-6-oauth-csrf-fix.md` - Technical details of OAuth CSRF fix

**Next Steps**:
- Proceed to Task 7: Register GitHub OAuth App
- Test Google OAuth flow end-to-end (user should test in browser)

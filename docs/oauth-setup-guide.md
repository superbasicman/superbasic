# OAuth Provider Setup Guide

This guide walks through setting up OAuth providers (Google and GitHub) for SuperBasic Finance authentication.

## Prerequisites

- Access to Google Cloud Console (for Google OAuth)
- GitHub account (for GitHub OAuth)
- Local development environment running (`pnpm dev`)

---

## Google OAuth Setup

### Step 1: Access Google Cloud Console

1. Navigate to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account

### Step 2: Create or Select Project

**Option A: Create New Project**
1. Click the project dropdown in the top navigation bar
2. Click "New Project"
3. Enter project name: `SuperBasic Finance` (or your preferred name)
4. Click "Create"
5. Wait for project creation (takes ~30 seconds)
6. Select the new project from the dropdown

**Option B: Use Existing Project**
1. Click the project dropdown
2. Select your existing project

### Step 3: Enable Google+ API

1. In the left sidebar, navigate to **APIs & Services > Library**
2. Search for "Google+ API"
3. Click on "Google+ API" in the results
4. Click "Enable" button
5. Wait for API to be enabled

### Step 4: Create OAuth 2.0 Credentials

1. Navigate to **APIs & Services > Credentials**
2. Click "Create Credentials" button at the top
3. Select "OAuth client ID" from the dropdown

### Step 5: Configure OAuth Consent Screen (First Time Only)

If prompted to configure consent screen:

1. Click "Configure Consent Screen"
2. Select "External" user type (unless you have Google Workspace)
3. Click "Create"
4. Fill in required fields:
   - **App name**: SuperBasic Finance
   - **User support email**: Your email
   - **Developer contact email**: Your email
5. Click "Save and Continue"
6. Skip "Scopes" section (click "Save and Continue")
7. Add test users if needed (click "Save and Continue")
8. Review summary and click "Back to Dashboard"

### Step 6: Create OAuth Client ID

1. Return to **APIs & Services > Credentials**
2. Click "Create Credentials" > "OAuth client ID"
3. Select application type: **Web application**
4. Enter name: `SuperBasic Finance - Development`

### Step 7: Configure Authorized Redirect URIs

Add the following redirect URIs:

**Development:**
```
http://localhost:3000/v1/auth/callback/google
```

**Production (when ready):**
```
https://api.superbasicfinance.com/v1/auth/callback/google
```

Click "Create"

### Step 8: Copy Credentials

1. A modal will appear with your credentials
2. **Copy the Client ID** (looks like: `123456789-abc123.apps.googleusercontent.com`)
3. **Copy the Client Secret** (looks like: `GOCSPX-abc123xyz`)
4. Click "OK"

**⚠️ Important**: Keep these credentials secure. Never commit them to version control.

### Step 9: Add Credentials to Environment

1. Open `apps/api/.env.local`
2. Replace the placeholder values:

```bash
GOOGLE_CLIENT_ID=123456789-abc123.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123xyz
```

3. Save the file

### Step 10: Verify Configuration

```bash
# Restart the API server
pnpm dev --filter=@repo/api

# Test the providers endpoint
curl http://localhost:3000/v1/auth/providers | jq

# Should show Google provider in the response:
# {
#   "google": {
#     "id": "google",
#     "name": "Google",
#     "type": "oauth",
#     ...
#   }
# }
```

### Step 11: Test OAuth Flow

1. Open your browser to: `http://localhost:3000/v1/auth/signin/google`
2. You should be redirected to Google's consent screen
3. Sign in with your Google account
4. Grant permissions
5. You should be redirected back to your app

**Troubleshooting:**
- If you see "Error 400: redirect_uri_mismatch", verify the redirect URI in Google Cloud Console matches exactly: `http://localhost:3000/v1/auth/callback/google`
- If you see "Access blocked: This app's request is invalid", ensure the OAuth consent screen is configured

---

## GitHub OAuth Setup

### Step 1: Access GitHub Developer Settings

1. Navigate to [GitHub Settings](https://github.com/settings/developers)
2. Sign in to your GitHub account
3. Click "OAuth Apps" in the left sidebar

### Step 2: Create New OAuth App

1. Click "New OAuth App" button
2. Fill in the application details:

**Application name:**
```
SuperBasic Finance - Development
```

**Homepage URL:**
```
http://localhost:3000
```

**Application description (optional):**
```
Personal finance platform with bank sync and budgeting
```

**Authorization callback URL:**
```
http://localhost:3000/v1/auth/callback/github
```

3. Click "Register application"

### Step 3: Generate Client Secret

1. After registration, you'll see your **Client ID** (looks like: `Iv1.abc123xyz`)
2. Click "Generate a new client secret"
3. **Copy the Client Secret immediately** (you won't be able to see it again)
4. Store it securely

### Step 4: Add Credentials to Environment

1. Open `apps/api/.env.local`
2. Replace the placeholder values:

```bash
GITHUB_CLIENT_ID=Iv1.abc123xyz
GITHUB_CLIENT_SECRET=abc123xyz456def789
```

3. Save the file

### Step 5: Verify Configuration

```bash
# Restart the API server
pnpm dev --filter=@repo/api

# Test the providers endpoint
curl http://localhost:3000/v1/auth/providers | jq

# Should show GitHub provider in the response:
# {
#   "github": {
#     "id": "github",
#     "name": "GitHub",
#     "type": "oauth",
#     ...
#   }
# }
```

### Step 6: Test OAuth Flow

1. Open your browser to: `http://localhost:3000/v1/auth/signin/github`
2. You should be redirected to GitHub's authorization screen
3. Click "Authorize" to grant permissions
4. You should be redirected back to your app

**Troubleshooting:**
- If you see "The redirect_uri MUST match the registered callback URL", verify the callback URL in GitHub matches exactly: `http://localhost:3000/v1/auth/callback/github`
- If authorization fails, check that your GitHub OAuth app is not suspended

---

## Production Setup

When deploying to production, you'll need to:

### Google OAuth (Production)

1. Return to Google Cloud Console
2. Navigate to **APIs & Services > Credentials**
3. Click on your OAuth client ID
4. Add production redirect URI:
   ```
   https://api.superbasicfinance.com/v1/auth/callback/google
   ```
5. Update production environment variables with the same credentials

### GitHub OAuth (Production)

**Option A: Update Existing App**
1. Go to your GitHub OAuth app settings
2. Update "Authorization callback URL" to:
   ```
   https://api.superbasicfinance.com/v1/auth/callback/github
   ```

**Option B: Create Separate Production App (Recommended)**
1. Create a new OAuth app named "SuperBasic Finance - Production"
2. Use production URLs
3. Generate new credentials
4. Use separate credentials for production environment

---

## Security Best Practices

### Credential Management

- ✅ **Never commit credentials to version control**
- ✅ **Use separate OAuth apps for development and production**
- ✅ **Rotate secrets regularly (every 90 days)**
- ✅ **Use environment variables for all secrets**
- ✅ **Restrict redirect URIs to known domains only**

### OAuth Consent Screen

- ✅ **Use clear, descriptive app name**
- ✅ **Provide accurate privacy policy and terms of service URLs**
- ✅ **Request only necessary scopes**
- ✅ **Keep app logo and branding consistent**

### Monitoring

- ✅ **Monitor OAuth success/failure rates**
- ✅ **Set up alerts for unusual authentication patterns**
- ✅ **Log OAuth errors for debugging**
- ✅ **Track which providers users prefer**

---

## Verification Checklist

After completing setup, verify:

- [ ] Google OAuth credentials added to `.env.local`
- [ ] GitHub OAuth credentials added to `.env.local`
- [ ] API server restarted
- [ ] `/v1/auth/providers` endpoint returns both providers
- [ ] Google OAuth flow completes successfully
- [ ] GitHub OAuth flow completes successfully
- [ ] User and profile records created in database
- [ ] Session cookie set correctly
- [ ] No CORS errors in browser console

---

## Next Steps

After completing OAuth setup:

1. ✅ Proceed to **Task 8**: Add OAuth Providers to Auth.js Config
2. ✅ Implement profile creation helper (Task 9)
3. ✅ Test OAuth flows end-to-end (Tasks 11-12)
4. ✅ (deprecated) Magic link authentication (Tasks 14-18)

---

## Troubleshooting

### Common Issues

**Issue: "redirect_uri_mismatch" error**
- **Cause**: Redirect URI in OAuth app doesn't match the one in your request
- **Fix**: Verify redirect URI in provider console matches exactly (including protocol, port, and path)

**Issue: "invalid_client" error**
- **Cause**: Client ID or secret is incorrect
- **Fix**: Double-check credentials in `.env.local`, ensure no extra spaces or quotes

**Issue: OAuth flow redirects but no session created**
- **Cause**: Profile creation callback may have failed
- **Fix**: Check API logs for errors, verify database connection, ensure `signIn` callback is implemented

**Issue: CORS errors during OAuth flow**
- **Cause**: CORS not configured for OAuth callback URLs
- **Fix**: Update CORS middleware to allow `http://localhost:3000` origin (Task 27)

### Getting Help

- **Auth.js Documentation**: https://authjs.dev/getting-started/providers/oauth
- **Google OAuth Docs**: https://developers.google.com/identity/protocols/oauth2
- **GitHub OAuth Docs**: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps

---

**Last Updated**: 2025-10-22

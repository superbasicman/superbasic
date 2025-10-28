# Vercel Deployment Guide

Complete guide for deploying to Vercel.

## TL;DR - Quick Deploy

1. **API**: Import repo → Set root to `apps/api` → Add env vars → Deploy
2. **Web**: Import repo → Set root to `apps/web` → Add `VITE_API_URL` → Deploy
3. **Update**: Add web URL to API's `WEB_APP_URL` → Redeploy API
4. **Test**: Visit web app, try logging in

**Critical**: Both apps need their own Vercel project. Don't try to deploy as one project.

**Deployment Flow**:

```
GitHub Repo
    ├── apps/api (Vercel Project 1)
    │   ├── vercel.json → Build config
    │   └── api/index.js → Serverless function
    │
    └── apps/web (Vercel Project 2)
        ├── vercel.json → Build config
        └── dist/ → Static site output
```

---

## Prerequisites

- Vercel account (sign up at https://vercel.com)
- GitHub repository with your code pushed
- Neon database (or other Postgres provider)
- Upstash Redis account (for rate limiting)
- Resend account (for magic links)
- Google OAuth credentials (for social login)

## Pre-Deployment Checklist

Before deploying to Vercel, ensure:

- [ ] All code is committed and pushed to GitHub
- [ ] `pnpm build` runs successfully locally
- [ ] `pnpm test` passes (all tests green)
- [ ] Database migrations are up to date (`pnpm db:migrate`)
- [ ] Environment variables are documented in `.env.example` files
- [ ] You have all required API keys (Neon, Upstash, Resend, Google OAuth)

## Important: Monorepo Setup

This project uses **pnpm workspaces** and **Turborepo**. Each app has a `vercel.json` that:

1. Installs dependencies from the workspace root: `pnpm install --no-frozen-lockfile`
2. Builds using Turborepo: `turbo run build --filter=@repo/api` (or `@repo/web`)
3. Handles workspace dependencies automatically

**Key Files**:

- `apps/api/vercel.json` - API build configuration
- `apps/api/api/index.js` - Vercel serverless function entry point
- `apps/web/vercel.json` - Web app build configuration

---

## Part 1: Deploy the API

### Step 1: Import API Project

1. Go to https://vercel.com/new
2. Click "Import Project"
3. Select your GitHub repository
4. **Important**: Click "Configure Project" to customize settings

### Step 2: Configure API Project

**Framework Preset**: Other (Vercel will use your vercel.json config)

**Root Directory**: `apps/api` (click "Edit" and select this folder)

**Build Settings**: Leave as default - your `vercel.json` handles this:

```json
{
  "buildCommand": "cd ../.. && turbo run build --filter=@repo/api",
  "installCommand": "pnpm install --no-frozen-lockfile"
}
```

**Note**: The `api/index.js` file is your Vercel serverless function entry point that wraps your Hono app.

### Step 3: Add API Environment Variables

Click "Environment Variables" and add these (use your actual values):

```bash
# Required - Database
DATABASE_URL=postgresql://user:password@your-neon-host.neon.tech/your_app?sslmode=require

# Required - Authentication
AUTH_SECRET=your-super-secret-auth-key-min-32-chars-change-in-production
AUTH_URL=https://your-api-domain.vercel.app
AUTH_TRUST_HOST=true
WEB_APP_URL=https://your-web-domain.vercel.app

# Required - Server
NODE_ENV=production
PORT=3000

# Required - Rate Limiting
UPSTASH_REDIS_REST_URL=https://your-redis-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# Required - Email (Magic Links)
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM=noreply@yourapp.com

# Required - OAuth
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

**Important Notes**:

- `AUTH_URL` should be your API domain (e.g., `https://api-yourapp.vercel.app`)
- `WEB_APP_URL` should be your web app domain (you'll get this after deploying the web app)
- Generate `AUTH_SECRET` with: `openssl rand -base64 32`

### Step 4: Deploy API

1. Click "Deploy"
2. Wait for build to complete (~2-3 minutes)
3. Copy your API URL (e.g., `https://api-yourapp.vercel.app`)

### Step 5: Verify API Deployment

Before proceeding, test your API is working:

```bash
# Test health endpoint
curl https://your-api-domain.vercel.app/v1/health

# Should return:
# {"status":"ok","timestamp":"2025-10-27T..."}
```

If you get a 404 or 500 error, check the Vercel deployment logs for build errors.

### Step 6: Update Google OAuth Redirect URI

1. Go to Google Cloud Console: https://console.cloud.google.com/apis/credentials
2. Edit your OAuth 2.0 Client ID
3. Add authorized redirect URI: `https://your-api-domain.vercel.app/v1/auth/callback/google`
4. Save changes

---

## Part 2: Deploy the Web App

### Step 1: Import Web Project

1. Go to https://vercel.com/new again
2. Click "Import Project"
3. Select the **same GitHub repository**
4. Click "Configure Project"

### Step 2: Configure Web Project

**Framework Preset**: Vite (Vercel should auto-detect this)

**Root Directory**: `apps/web` (click "Edit" and select this folder)

**Build Settings**: Leave as default - your `vercel.json` handles this:

```json
{
  "version": 2,
  "buildCommand": "cd ../.. && turbo run build --filter=@repo/web",
  "outputDirectory": "dist",
  "installCommand": "pnpm install --no-frozen-lockfile"
}
```

**Note**: Vercel will automatically serve your built Vite app as a static site with SPA routing.

### Step 3: Add Web Environment Variables

Click "Environment Variables" and add:

```bash
# Point to your deployed API
VITE_API_URL=https://your-api-domain.vercel.app
```

Replace `your-api-domain.vercel.app` with the actual API URL from Part 1, Step 4.

### Step 4: Deploy Web App

1. Click "Deploy"
2. Wait for build to complete (~2-3 minutes)
3. Copy your web app URL (e.g., `https://yourapp-web.vercel.app`)

**What to Expect**:

- Vercel will install pnpm dependencies from workspace root
- Turborepo will build all required packages (`@repo/design-system`, `@repo/types`, etc.)
- Vite will bundle your React app
- Output will be a static site in the `dist/` directory
- Vercel will configure SPA routing automatically (all routes serve `index.html`)

### Step 5: Verify Web Deployment

Visit your web app URL. You should see:

- The login page loads without errors
- No console errors in browser DevTools
- Tailwind CSS styles are applied correctly

If you see a blank page or errors, check the Vercel deployment logs.

---

## Part 3: Update API Environment Variables

Now that you have both URLs, update your API environment variables:

1. Go to your API project in Vercel
2. Click "Settings" → "Environment Variables"
3. Update `WEB_APP_URL` to your actual web app URL
4. Click "Save"
5. Go to "Deployments" and redeploy the latest deployment

---

## Part 4: Test Your Deployment

### Test API Health

```bash
curl https://your-api-domain.vercel.app/v1/health
```

Should return:

```json
{ "status": "ok", "timestamp": "2025-10-27T..." }
```

### Test Sign-In Page

1. Visit `https://your-web-domain.vercel.app`
2. You should see the login page
3. Try signing in with credentials (if you have a test account)
4. Try "Continue with Google" button
5. Try requesting a magic link

---

## Troubleshooting

### Build Fails with "Cannot find module"

**Problem**: Monorepo dependencies not resolving

**Solutions**:

1. Verify `vercel.json` exists in your app directory (`apps/api/vercel.json` or `apps/web/vercel.json`)
2. Check `installCommand` uses `pnpm install --no-frozen-lockfile` (not `npm install`)
3. Ensure `buildCommand` starts with `cd ../..` to run from workspace root
4. Verify all workspace dependencies are listed in `package.json` (e.g., `@repo/auth`, `@repo/database`)

### Build Fails with "turbo: command not found"

**Problem**: Turborepo not installed

**Solution**: Turborepo is installed as a workspace dependency. The `cd ../..` in `buildCommand` ensures it runs from the root where `turbo` is available.

### Build Fails with esbuild Version Mismatch

**Problem**: Multiple versions of esbuild causing conflicts during build

**Error Example**: `Error: Expected "0.25.11" but got "0.21.5"`

**Solution**: Add esbuild override to root `package.json`:

```json
{
  "pnpm": {
    "overrides": {
      "esbuild": "^0.21.5"
    }
  }
}
```

Then reinstall and push:

```bash
pnpm install
git add package.json pnpm-lock.yaml
git commit -m "fix: force esbuild version"
git push
```

Vercel will automatically redeploy with the unified esbuild version.

### API Returns 404 for All Routes

**Problem**: Vercel serverless function not configured correctly

**Solutions**:

1. Verify `apps/api/api/index.js` exists and exports your Hono app
2. Check the file exports: `export default { fetch: app.fetch.bind(app) }`
3. Ensure your Hono app is built to `dist/app.js` (check `apps/api/tsconfig.json`)
4. Verify Vercel detected the `api/` directory as a serverless function

### OAuth Redirect Fails

**Problem**: Google OAuth returns error after sign-in

**Solutions**:

1. Check `AUTH_URL` matches your API domain exactly
2. Verify redirect URI in Google Cloud Console matches: `https://your-api-domain.vercel.app/v1/auth/callback/google`
3. Check `WEB_APP_URL` is set correctly in API environment variables

### Magic Links Not Sending

**Problem**: Email not arriving

**Solutions**:

1. Check `RESEND_API_KEY` is correct
2. Verify `EMAIL_FROM` domain is verified in Resend
3. Check Vercel logs for email sending errors

### CORS Errors in Browser

**Problem**: Web app can't connect to API

**Common Errors**:

- `Response to preflight request doesn't pass access control check: Redirect is not allowed`
- `Access to fetch has been blocked by CORS policy`

**Solutions**:

1. **Remove trailing slash from `VITE_API_URL`**: Should be `https://api.vercel.app` not `https://api.vercel.app/`
2. Verify API CORS middleware allows your web app domain (check `apps/api/src/middleware/cors.ts`)
3. Ensure both apps are deployed (not mixing local + production)
4. Check browser console for the actual failing URL (look for double slashes like `//v1/auth/session`)

**Note**: The API client automatically strips trailing slashes, but double-check your environment variable.

### Database Connection Fails

**Problem**: API can't connect to Neon

**Solutions**:

1. Verify `DATABASE_URL` includes `?sslmode=require`
2. Check Neon database is not paused (free tier auto-pauses)
3. Verify connection string has correct credentials

---

## Common Deployment Mistakes

### ❌ Trailing Slash in VITE_API_URL

**Wrong**: `VITE_API_URL=https://api.vercel.app/`  
**Right**: `VITE_API_URL=https://api.vercel.app`

Trailing slashes cause double slashes in URLs (`//v1/auth/session`).

### ❌ Mismatched AUTH_URL and WEB_APP_URL

**Wrong**: Both pointing to same domain  
**Right**: AUTH_URL = API domain, WEB_APP_URL = web domain

```bash
# API environment variables
AUTH_URL=https://superbasic-api.vercel.app
WEB_APP_URL=https://superbasic-web.vercel.app
```

### ❌ Forgetting to Redeploy API After Adding WEB_APP_URL

After deploying web app, you must:

1. Add `WEB_APP_URL` to API environment variables
2. **Redeploy the API** (environment changes don't auto-deploy)

### ❌ Using Wrong Google OAuth Redirect URI

**Wrong**: `http://localhost:3000/v1/auth/callback/google`  
**Right**: `https://your-api-domain.vercel.app/v1/auth/callback/google`

Must match your production API domain exactly.

### ❌ Auth.js Redirecting to /login on API Server (404)

**Error**: `GET https://api.vercel.app/login?error=MissingCSRF 404`

**Cause**: Missing or incorrect `WEB_APP_URL` environment variable on API

**Fix**: Ensure `WEB_APP_URL` is set correctly in API environment variables and redeploy

---

## Environment Variable Checklist

### API Project (apps/api)

- [ ] `DATABASE_URL` - Neon connection string with SSL
- [ ] `AUTH_SECRET` - Random 32+ character string
- [ ] `AUTH_URL` - Your API domain (https://...)
- [ ] `AUTH_TRUST_HOST` - Set to `true`
- [ ] `WEB_APP_URL` - Your web app domain (https://...)
- [ ] `NODE_ENV` - Set to `production`
- [ ] `PORT` - Set to `3000`
- [ ] `UPSTASH_REDIS_REST_URL` - Redis URL
- [ ] `UPSTASH_REDIS_REST_TOKEN` - Redis token
- [ ] `RESEND_API_KEY` - Resend API key
- [ ] `EMAIL_FROM` - Verified email address
- [ ] `GOOGLE_CLIENT_ID` - Google OAuth client ID
- [ ] `GOOGLE_CLIENT_SECRET` - Google OAuth secret

### Web Project (apps/web)

- [ ] `VITE_API_URL` - Your API domain (https://...)

---

## Production Best Practices

### Security

1. **Rotate AUTH_SECRET** - Use a cryptographically secure random string
2. **Enable HTTPS only** - Vercel does this by default
3. **Review CORS settings** - Ensure only your web app can access API
4. **Monitor rate limits** - Check Upstash Redis usage

### Monitoring

1. **Enable Vercel Analytics** - Track performance and errors
2. **Set up Sentry** - Capture runtime errors (optional)
3. **Monitor Neon usage** - Watch database connection limits
4. **Check Resend logs** - Verify email delivery

### Database

1. **Run migrations** - Before deploying: `pnpm db:migrate`
2. **Backup regularly** - Neon provides automatic backups
3. **Use connection pooling** - Neon handles this automatically

---

## Quick Reference

### Useful Commands

```bash
# Generate AUTH_SECRET
openssl rand -base64 32

# Test API locally
pnpm dev --filter=@repo/api

# Test web locally
pnpm dev --filter=@repo/web

# Build everything
pnpm build

# Run migrations
pnpm db:migrate
```

### Important URLs

- Vercel Dashboard: https://vercel.com/dashboard
- Google Cloud Console: https://console.cloud.google.com/apis/credentials
- Neon Dashboard: https://console.neon.tech
- Upstash Console: https://console.upstash.com
- Resend Dashboard: https://resend.com/emails

---

## Quick Deployment Summary

### API Deployment

```bash
# What Vercel does:
1. cd ../.. (go to workspace root)
2. pnpm install --no-frozen-lockfile (install all dependencies)
3. turbo run build --filter=@repo/api (build API + dependencies)
4. Deploy api/index.js as serverless function
```

### Web Deployment

```bash
# What Vercel does:
1. cd ../.. (go to workspace root)
2. pnpm install --no-frozen-lockfile (install all dependencies)
3. turbo run build --filter=@repo/web (build web + dependencies)
4. Deploy dist/ as static site with SPA routing
```

## Next Steps

After successful deployment:

1. Test all authentication flows (credentials, OAuth, magic links)
2. Create a test user account
3. Test API key creation (Phase 3 feature)
4. Monitor Vercel logs for any errors
5. Set up custom domains (optional)

## Common Post-Deployment Issues

### Web App Shows "Failed to fetch" Errors

**Problem**: CORS or API URL misconfiguration

**Solutions**:

1. Check `VITE_API_URL` in web app environment variables
2. Verify API CORS middleware allows your web domain
3. Test API health endpoint directly: `curl https://your-api.vercel.app/v1/health`

### OAuth Works Locally But Fails in Production

**Problem**: Redirect URI mismatch

**Solutions**:

1. Verify `AUTH_URL` in API env vars matches your actual API domain
2. Check Google Cloud Console has correct redirect URI
3. Ensure `WEB_APP_URL` points to your actual web domain

### Magic Links Not Sending in Production

**Problem**: Email configuration issue

**Solutions**:

1. Verify `RESEND_API_KEY` is correct (not the test key)
2. Check `EMAIL_FROM` domain is verified in Resend
3. Review Vercel function logs for email sending errors

---

**Last Updated**: 2025-10-27

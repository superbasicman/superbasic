# Vercel Deployment Guide

Complete guide for deploying SuperBasic Finance to Vercel.

## Prerequisites

- Vercel account (sign up at https://vercel.com)
- GitHub repository with your code pushed
- Neon database (or other Postgres provider)
- Upstash Redis account (for rate limiting)
- Resend account (for magic links)
- Google OAuth credentials (for social login)

---

## Part 1: Deploy the API

### Step 1: Import API Project

1. Go to https://vercel.com/new
2. Click "Import Project"
3. Select your GitHub repository
4. **Important**: Click "Configure Project" to customize settings

### Step 2: Configure API Project

**Framework Preset**: Hono (Vercel should auto-detect this)

**Root Directory**: `apps/api` (click "Edit" and select this folder)

**Build Settings**:

- Build Command: `cd ../.. && pnpm install && turbo run build --filter=@repo/api`
- Output Directory: `dist`
- Install Command: Leave empty (handled by build command)

### Step 3: Add API Environment Variables

Click "Environment Variables" and add these (use your actual values):

```bash
# Required - Database
DATABASE_URL=postgresql://user:password@your-neon-host.neon.tech/superbasic_finance?sslmode=require

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
EMAIL_FROM=noreply@superbasicfinance.com

# Required - OAuth
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

**Important Notes**:

- `AUTH_URL` should be your API domain (e.g., `https://api-superbasic.vercel.app`)
- `WEB_APP_URL` should be your web app domain (you'll get this after deploying the web app)
- Generate `AUTH_SECRET` with: `openssl rand -base64 32`

### Step 4: Deploy API

1. Click "Deploy"
2. Wait for build to complete (~2-3 minutes)
3. Copy your API URL (e.g., `https://api-superbasic.vercel.app`)

### Step 5: Update Google OAuth Redirect URI

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

**Framework Preset**: Vite

**Root Directory**: `apps/web` (click "Edit" and select this folder)

**Build Settings**:

- Build Command: `cd ../.. && pnpm install && turbo run build --filter=@repo/web`
- Output Directory: `dist`
- Install Command: Leave empty (handled by build command)

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
3. Copy your web app URL (e.g., `https://superbasic-web.vercel.app`)

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

**Solution**: Ensure `buildCommand` includes `cd ../.. && pnpm install` to install from workspace root

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

**Solutions**:

1. Verify `VITE_API_URL` in web app environment variables
2. Check API CORS middleware allows your web app domain
3. Ensure both apps are deployed (not mixing local + production)

### Database Connection Fails

**Problem**: API can't connect to Neon

**Solutions**:

1. Verify `DATABASE_URL` includes `?sslmode=require`
2. Check Neon database is not paused (free tier auto-pauses)
3. Verify connection string has correct credentials

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

## Next Steps

After successful deployment:

1. Test all authentication flows (credentials, OAuth, magic links)
2. Create a test user account
3. Test API key creation (Phase 3 feature)
4. Monitor Vercel logs for any errors
5. Set up custom domains (optional)

---

**Last Updated**: 2025-10-27

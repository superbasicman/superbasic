# Neon Database Branch Setup

**Goal**: Use `dev` branch for local/preview, `main` branch for production.

## Interactive Setup (Recommended)

Run the setup wizard that walks you through each step:

```bash
pnpm tsx tooling/scripts/setup-neon-branches.ts
```

The script will:
1. Prompt you for Neon connection strings
2. Update your local `.env.local` files
3. Guide you through Vercel configuration
4. Verify the setup

## Manual Setup

If you prefer to do it manually:

### 1. Get Neon Connection Strings

1. Go to https://console.neon.tech → Your Project → Branches
2. Create `dev` branch from `main` (if needed)
3. Copy both connection strings

### 2. Update Local Files

Edit both files to use `dev` branch:
- `apps/api/.env.local`
- `packages/database/.env.local`

```bash
DATABASE_URL=postgresql://...@ep-dev-xxx.neon.tech/...
```

### 3. Configure Vercel

Go to Vercel → API Project → Settings → Environment Variables

Add `DATABASE_URL` twice:
- Production: `main` branch connection string
- Preview: `dev` branch connection string

### 4. Redeploy

Redeploy production and preview in Vercel.

## Verify Setup

```bash
# Check local connection
pnpm tsx tooling/scripts/check-db-branch.ts

# Test APIs
curl https://your-api-production.vercel.app/v1/health
```

## Result

| Environment | Branch |
|-------------|--------|
| Local Dev | `dev` |
| Vercel Preview | `dev` |
| Vercel Production | `main` |

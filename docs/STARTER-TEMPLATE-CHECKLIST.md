# Starter Template Branch Checklist

Use this checklist when creating the `starter-template` branch for future projects.

## Pre-Branch Checklist

Before creating the starter template branch, ensure:

- [ ] All tests passing (234+ tests)
- [ ] No sensitive data in committed files
- [ ] `.env.local` files are gitignored (not committed)
- [ ] `.env.example` files are up to date
- [ ] Documentation is current
- [ ] No temporary debug code or console.logs
- [ ] All features working locally

## Create Starter Template Branch

```bash
# Make sure you're on main and up to date
git checkout main
git pull origin main

# Create and push starter template branch
git checkout -b starter-template
git push origin starter-template
```

## Files to Review Before Committing

### Environment Files (Should NOT be committed)

- [ ] `apps/api/.env.local` - Not in git
- [ ] `apps/web/.env.local` - Not in git
- [ ] `packages/database/.env.local` - Not in git
- [ ] `.env` - Not in git

### Example Files (SHOULD be committed)

- [ ] `apps/api/.env.example` - Has placeholder values
- [ ] `apps/web/.env.example` - Has placeholder values
- [ ] `packages/database/.env.example` - Has placeholder values

### Documentation Files

- [ ] `README.md` - Updated with current features
- [ ] `QUICKSTART.md` - Step-by-step setup guide
- [ ] `docs/SETUP-NEON-BRANCHES.md` - Database setup
- [ ] `docs/vercel-deployment-guide.md` - Deployment guide
- [ ] `tooling/scripts/README.md` - Script documentation

### Setup Scripts

- [ ] `tooling/scripts/setup-env.ts` - Interactive setup wizard
- [ ] `tooling/scripts/setup-neon-branches.ts` - Neon branch setup
- [ ] `tooling/scripts/check-db-branch.ts` - Verify database connection

## Verify Starter Template

After creating the branch, test it by cloning fresh:

```bash
# Clone in a new directory
cd /tmp
git clone <your-repo-url> test-starter
cd test-starter
git checkout starter-template

# Run setup wizard
pnpm install
pnpm tsx tooling/scripts/setup-env.ts

# Start dev server
pnpm dev

# Run tests
pnpm test
```

## What's Included in Starter Template

### ✅ Features

- Auth.js authentication (credentials, OAuth) — magic links deprecated
- API key management with Bearer token auth
- Rate limiting with Upstash Redis
- Audit logging with Pino
- CORS configuration
- Scope-based permissions
- 234+ passing tests

### ✅ Infrastructure

- Monorepo with pnpm workspaces
- Turborepo for build orchestration
- TypeScript strict mode
- Biome for linting/formatting
- Vitest for unit/integration tests
- Playwright for E2E tests

### ✅ Documentation

- Complete setup guides
- API authentication documentation
- Deployment guides (Vercel)
- Phase summaries (1, 2, 2.1, 3)

### ✅ Setup Tools

- Interactive environment setup wizard
- Database branch configuration script
- Connection verification script

## Using the Starter Template

When starting a new project from this template:

1. Clone the repository:
   ```bash
   git clone <repo-url> my-new-project
   cd my-new-project
   git checkout starter-template
   ```

2. Create a new branch for your project:
   ```bash
   git checkout -b main
   ```

3. Run the setup wizard:
   ```bash
   pnpm install
   pnpm tsx tooling/scripts/setup-env.ts
   ```

4. Start building:
   ```bash
   pnpm dev
   ```

## Maintenance

Update the starter template periodically:

```bash
# Checkout starter template
git checkout starter-template

# Merge latest changes from main (carefully)
git merge main

# Test everything
pnpm install
pnpm test
pnpm build

# Push updates
git push origin starter-template
```

## What NOT to Include

❌ **Never commit:**
- Real API keys or secrets
- Production database URLs
- Personal email addresses
- OAuth credentials
- `.env.local` files

❌ **Remove before committing:**
- Debug console.logs
- Commented-out code
- Temporary test files
- Personal notes or TODOs

## Verification Checklist

Before finalizing the starter template:

- [ ] `pnpm install` works
- [ ] `pnpm build` succeeds
- [ ] `pnpm test` passes (all tests)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] Setup wizard runs successfully
- [ ] Dev server starts without errors
- [ ] Can create account and log in
- [ ] API key creation works
- [ ] No secrets in committed files
- [ ] Documentation is accurate

---

**Last Updated**: 2025-10-28

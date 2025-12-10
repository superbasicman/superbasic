# Tooling Scripts

Utility scripts for development, testing, and operations.

## Permanent Scripts

### Authentication & Environment

**`setup-env.ts`**
- Interactive wizard for complete environment setup
- Configures database, auth, Redis, OAuth, and email
- Perfect for first-time setup or cloning the starter template

```bash
pnpm setup:env
# OR
pnpm tsx tooling/scripts/setup-env.ts
```

**`setup-plaid.ts`** ⭐ **NEW**
- Interactive wizard for Plaid integration setup (Phase 4)
- Walks through Plaid account registration and API credentials
- Generates encryption key for access token storage
- Configures products, country codes, redirect URI, and webhooks
- Updates apps/api/.env.local with Plaid configuration

```bash
pnpm setup:plaid
# OR
pnpm tsx tooling/scripts/setup-plaid.ts
```

**Prerequisites for Plaid setup:**
- Run `pnpm setup:env` first to create base .env files
- Have a Plaid developer account (script guides you through signup)

**`check-auth-env.ts`**
- Validates auth-core environment variables
- Checks for required secrets (JWT signing keys, token hash keys, OAuth/email provider)
- Run before deployment or when debugging auth issues

```bash
pnpm tsx tooling/scripts/check-auth-env.ts
```

### Database Operations
- Interactive setup wizard for Neon database branch configuration
- Walks you through configuring dev/main branch isolation
- Updates local files and provides Vercel instructions

```bash
pnpm tsx tooling/scripts/setup-neon-branches.ts
```

**`check-db-branch.ts`**
- Shows which Neon database branch you're connected to
- Helps verify environment configuration
- Run after setup to confirm everything is correct

```bash
pnpm tsx tooling/scripts/check-db-branch.ts
```

**`reset-devdb-and-test.mjs`**
- Resets dev database and runs core package tests
- Used for testing against real Neon dev branch
- Includes safety prompts to prevent accidental production resets

```bash
pnpm db:reset-and-test
# OR
node tooling/scripts/reset-devdb-and-test.mjs
```

**`run-core-tests-devdb.mjs`**
- Runs core package tests against dev database without reset
- Faster than full reset when database is already in clean state

```bash
pnpm test:core:devdb
# OR
node tooling/scripts/run-core-tests-devdb.mjs
```

### Rate Limiting

**`clear-magic-link-rate-limit.ts`**
- Clears magic link rate limit for specific email
- Useful for testing or customer support
- Requires email address as argument

```bash
pnpm tsx tooling/scripts/clear-magic-link-rate-limit.ts user@example.com
```

### PWA Assets

**`create-placeholder-icons.sh`**
- Generates placeholder PWA icons (192x192, 512x512, apple-touch-icon, favicons)
- Creates minimal blue PNG files and SVG favicon with "SBF" text
- Run once during initial setup or after deleting public directory

```bash
./tooling/scripts/create-placeholder-icons.sh
```

**`verify-pwa.sh`**
- Verifies PWA setup is complete
- Checks for required icon files and vite-plugin-pwa configuration
- Run after icon generation or when troubleshooting PWA issues

```bash
./tooling/scripts/verify-pwa.sh
```

## Script Guidelines

### Creating New Scripts

1. **Temporary scripts** (one-time use):
   - Create in `scripts/temp/` during development
   - Delete after task completion
   - Document what they did in task notes

2. **Permanent scripts** (reusable):
   - Place in `tooling/scripts/`
   - Add proper error handling
   - Document in this README
   - Include usage examples

### Script Naming

- Use kebab-case: `check-auth-env.ts`
- Be descriptive: `clear-magic-link-rate-limit.ts` not `clear-limit.ts`
- Include file extension: `.ts`, `.sh`, `.js`

### Documentation Requirements

Each permanent script should have:
- Clear purpose description
- Usage example with arguments
- Prerequisites (if any)
- Expected output or behavior

## Archived Scripts

The following scripts have been removed as they are no longer needed:

**Phase 2.1 Migration Scripts (Removed):**
- `task-4-sanity-checks.sh` - Auth validation (replaced by integration tests)
- `backfill-profiles.ts` - One-time migration (profiles now auto-created via auth-core)
- `test-resend.ts` - Email verification (one-time testing)
- `test-credentials-signin.sh`, `test-magic-link-*.sh`, `test-session-endpoint.sh`, `test-signout.sh` - Debugging helpers (replaced by test suites)

**Deprecated Production Scripts (Removed):**
- `migrate-production.ts` - Risky, use Prisma CLI directly instead

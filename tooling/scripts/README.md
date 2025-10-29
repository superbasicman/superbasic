# Tooling Scripts

Utility scripts for development, testing, and operations.

## Permanent Scripts

### Authentication & Environment

**`check-auth-env.ts`**
- Validates Auth.js environment variables
- Checks for required secrets (NEXTAUTH_SECRET, OAuth credentials)
- Run before deployment or when debugging auth issues

```bash
pnpm tsx tooling/scripts/check-auth-env.ts
```

**`task-4-sanity-checks.sh`**
- Complete Auth.js integration test suite
- Runs 7 sanity checks for credentials flow
- Used for Phase 2.1 validation

```bash
./tooling/scripts/task-4-sanity-checks.sh
```

### Database Operations

**`backfill-profiles.ts`**
- Creates profiles for users missing them
- Idempotent - safe to run multiple times
- Used during Auth.js migration

```bash
pnpm tsx tooling/scripts/backfill-profiles.ts
```

**`setup-neon-branches.ts`**
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

### Rate Limiting

**`clear-magic-link-rate-limit.ts`**
- Clears magic link rate limit for specific email
- Useful for testing or customer support
- Requires email address as argument

```bash
pnpm tsx tooling/scripts/clear-magic-link-rate-limit.ts user@example.com
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

Temporary debugging scripts from Phase 2.1 have been removed:
- `test-resend.ts` - Email verification (one-time)
- `test-credentials-signin.sh` - Debugging helper
- `test-magic-link-*.sh` - Debugging helpers
- `test-session-endpoint.sh` - Debugging helper
- `test-signout.sh` - Debugging helper

These were used during development and are no longer needed. Their functionality is covered by:
- Integration tests in `apps/api/src/routes/v1/__tests__/`
- Sanity check suite in `task-4-sanity-checks.sh`

# Quick Start Guide

Get up and running with SuperBasic Finance in 5 minutes.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Accounts for:
  - [Neon](https://neon.tech) (Postgres database)
  - [Upstash](https://upstash.com) (Redis for rate limiting)
  - [Google Cloud](https://console.cloud.google.com) (OAuth - optional)
  - [Resend](https://resend.com) (Email - optional)

## Setup Steps

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd superbasic-finance
pnpm install
```

### 2. Run Setup Wizard

```bash
pnpm tsx tooling/scripts/setup-env.ts
```

The wizard will guide you through:

- ✅ Neon database connection
- ✅ Auth-core signing key and token hash secret generation
- ✅ Upstash Redis configuration
- ✅ Google OAuth setup (optional)
- ✅ Resend email setup (optional)
- ✅ Database migrations

### 3. Start Development Server

```bash
pnpm dev
```

This starts:

- API server at http://localhost:3000
- Web app at http://localhost:5173

### 4. Test It Out

Open http://localhost:5173 and try:

- Creating an account (credentials)
- Logging in with Google (if configured)
- Requesting a magic link (if configured)

## What's Included

✅ **Authentication**

- OAuth 2.1/OIDC via auth-core (email/password + magic link + Google)
- Short-lived access tokens + rotated refresh tokens (HttpOnly cookies)
- Personal Access Tokens (PATs) for programmatic access

✅ **API Key Management**

- Generate personal access tokens (PATs)
- Bearer token authentication
- Scope-based permissions

✅ **Security**

- Rate limiting (10 req/min on auth endpoints)
- CORS configuration
- Audit logging
- Token hashing (SHA-256)

✅ **Testing**

- 234+ passing tests
- Unit, integration, and E2E tests
- Playwright for browser testing

## Project Structure

```
apps/
├── api/          # Hono API server (Node.js)
└── web/          # React SPA (Vite)

packages/
├── auth-core/    # Auth-core OAuth 2.1/OIDC logic and token management
├── auth/         # Shared auth utilities (hashing, envelopes, helpers for auth-core)
├── database/     # Prisma schema and client
├── design-system/# React components
└── types/        # Shared TypeScript types
```

## Common Commands

```bash
# Development
pnpm dev                    # Start all apps
pnpm dev --filter=api       # Start API only
pnpm dev --filter=web       # Start web only

# Database
pnpm db:migrate             # Run migrations
pnpm db:studio              # Open Prisma Studio
pnpm db:generate            # Generate Prisma client

# Testing
pnpm test                   # Run all tests
pnpm test:e2e               # Run E2E tests

# Build
pnpm build                  # Build all packages
pnpm typecheck              # Type check all packages
pnpm lint                   # Lint all packages
```

## Troubleshooting

### "Cannot connect to database"

Check your `DATABASE_URL` in `apps/api/.env.local`:

```bash
pnpm tsx tooling/scripts/check-db-branch.ts
```

### "Rate limit errors in tests"

This is expected - Redis state persists between test runs. Tests are still passing.

### "Google OAuth not working"

See `docs/auth-migration/end-auth-goal.md` for the current OAuth client configuration and redirect URIs; ensure `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set to match the configured client.

### "Magic links not sending"

1. Check `RESEND_API_KEY` is valid
2. Verify `EMAIL_FROM` domain is verified in Resend
3. Check API logs for email sending errors

## Next Steps

- [Full Documentation](docs/project_plan.md)
- [API Authentication Guide](docs/api-authentication.md)
- [Deployment Guide](docs/vercel-deployment-guide.md)
- [Phase Summaries](docs/phase-1-readme.md)

## Support

For issues or questions:

1. Check the [documentation](docs/)
2. Review [test files](apps/api/src/routes/v1/__tests__/) for examples
3. Open an issue on GitHub

---

**Ready to build?** Start with `pnpm dev` and open http://localhost:5173 🚀

# Technology Stack

## Languages & Runtime

- **TypeScript** (strict mode) with ESM-first builds
- **Node 20+** with Edge-compatible utilities where possible

## Backend Stack

- **Hono 4** on Node adapter (edge-ready) serving /v1 routes
- **Zod** for validation with OpenAPI generation (zod-to-openapi)
- **Prisma 6** (@repo/database) with Neon-hosted Postgres (no Drizzle for v1)
- **Auth.js** for authentication (credentials + OAuth) with JWT sessions
- **Stripe SDK** (@repo/payments) for billing
- **Plaid SDK** for bank sync (server-side token exchange)
- **Upstash Redis** (@repo/rate-limit) for rate limiting and caching
- **Upstash QStash** for background job delivery
- **Pino** (planned) + Sentry/Logtail for structured logging (@repo/observability)
- **Vitest** for unit/integration tests

## Frontend Stack

- **Vite** + **React 19** (pure SPA, no SSR)
- **React Router** for client-side routing
- **Tailwind CSS** for styling (custom components, no third-party UI libraries)
- **TanStack Query** for API state management with generated SDK
- **Plaid Link** integration (client token from API)
- **Capacitor-ready** architecture for future iOS/Android deployment

## Marketing Site (Separate)

- **Next.js** or **Astro** for blog and landing pages (deployed separately)
- SEO-optimized static generation for marketing content
- Separate deployment from main dashboard app

## Monorepo Tooling

- **pnpm** workspaces for package management
- **Turborepo** for build orchestration (lint → typecheck → test → build)
- **Biome** for linting and formatting
- **tsup** for package bundling
- **Husky** + **lint-staged** for pre-commit hooks
- **Changesets** (planned) for SDK versioning
- **Playwright** for E2E testing

## Common Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm dev                    # Start all apps in dev mode
pnpm dev --filter=api       # Start API only
pnpm dev --filter=web       # Start web client only

# Build
pnpm build                  # Build all packages and apps
pnpm build --filter=api     # Build API only

# Testing
pnpm test                   # Run all tests
pnpm test:unit              # Unit tests only
pnpm test:e2e               # E2E tests with Playwright

# Linting & Type Checking
pnpm lint                   # Lint all packages
pnpm typecheck              # Type check all packages
pnpm format                 # Format with Biome

# Database
pnpm db:migrate             # Run Prisma migrations
pnpm db:generate            # Generate Prisma client
pnpm db:studio              # Open Prisma Studio

# OpenAPI
pnpm api:docs               # Generate OpenAPI spec
pnpm sdk:generate           # Generate SDK from OpenAPI spec
```

## Security Stack

- Auth.js sessions + hashed PATs stored in Postgres
- RBAC scopes in packages/auth/rbac.ts
- Upstash-backed rate limits (per IP + per key)
- Bearer auth enforced on all /v1 routes
- HMAC-verified Stripe webhooks with raw-body middleware
- Postgres row-level security for workspace/user scoping (planned)

## Deployment

- **Vercel** for apps/api and apps/web (decoupled deployments)
- **Neon** for Postgres hosting with instant branching (perfect for preview environments)
- **Upstash** for Redis and QStash
- Environments: dev, preview, prod with isolated databases
- **No Supabase** - using Neon for Postgres only, Auth.js for auth, custom Hono API

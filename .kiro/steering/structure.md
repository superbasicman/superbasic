# Project Structure

## Monorepo Layout

```
.
├─ apps/
│  ├─ api/                  # Hono API server exposing /v1 routes (Node adapter)
│  │  └─ src/routes/v1/     # API route handlers
│  │     ├─ billing.checkout.ts
│  │     ├─ billing.portal.ts
│  │     └─ webhooks.stripe.ts
│  └─ web/                  # Thin React SPA (Vite, calls API only)
├─ packages/
│  ├─ core/                 # Domain logic (billing, ledgers, limits)
│  ├─ db/                   # Prisma schema + migrations + client exports
│  ├─ types/                # Zod contracts shared across layers
│  ├─ auth/                 # Auth.js adapters, PAT hashing, RBAC scopes
│  ├─ sdk/                  # Generated OpenAPI client
│  ├─ observability/        # Logging, tracing, audit emitters
│  └─ rate-limit/           # Upstash helpers
└─ tooling/
   ├─ ci/                   # GitHub Actions / Turborepo presets
   └─ scripts/              # Migration + release automation
```

## Key Conventions

### API Structure (apps/api)

- All public routes under `/src/routes/v1/`
- Route files named by resource and action: `{resource}.{action}.ts`
- Each route exports Zod schemas for validation and OpenAPI generation
- OpenAPI spec served at `/v1/docs` with Swagger UI
- All responses are JSON only
- Bearer auth required on all /v1 routes (PAT or JWT)

### Web Client (apps/web)

- Vite + React 19 SPA (pure client-side)
- React Router for routing
- **No direct database access** - all data via public API
- **No Stripe/Plaid secrets** - all sensitive operations via API
- **Capacitor-ready** - architecture supports wrapping for iOS/Android
- All API calls via TanStack Query + generated SDK

### Shared Packages

- **@repo/database**: Prisma schema, migrations, client exports
- **@repo/types**: Zod schemas shared between API and web
- **@repo/auth**: Auth.js configuration, PAT utilities, RBAC definitions
- **@repo/payments**: Stripe SDK wrappers and webhook handlers
- **@repo/rate-limit**: Upstash Redis rate limiting utilities
- **@repo/observability**: Logging, tracing, audit trail emitters
- **@repo/design-system**: Custom React components built with Tailwind CSS (no third-party UI libraries)

### Database (packages/db)

- **Prisma 6 only** - no Drizzle adapters for v1 (keep it simple)
- Neon-hosted Postgres with instant branching for preview environments
- Migrations are code-first, versioned, and run via CI
- **Append-only finance data** - adjustments via compensating ledger entries
- Row-level security (RLS) policies for workspace/user scoping (planned)
- Key tables: users, api_keys, stripe_customers, subscriptions, processed_events, ledger_entries, plaid_items, plaid_accounts, workspaces, workspace_members

### File Naming

- Use kebab-case for files: `billing-service.ts`, `user-repository.ts`
- Route files: `{resource}.{action}.ts` (e.g., `billing.checkout.ts`)
- Test files: `{filename}.test.ts` or `{filename}.spec.ts`
- Type files: `{domain}.types.ts` or `{domain}.schema.ts`

### Import Conventions

- Use workspace aliases: `@repo/database`, `@repo/types`, etc.
- Prefer named exports over default exports
- Group imports: external → workspace → relative

### Background Jobs

- Initial Plaid sync → Upstash QStash worker (long-running)
- Manual "Sync Now" → client-driven batching (< 10s per request)
- Periodic tasks → Vercel Cron (quick tasks only, or enqueue to QStash)
- All jobs use cursors and processed_events for idempotency

### Testing Organization

- Unit tests: Vitest in packages (core, auth, db)
- Integration tests: Supertest/undici against /v1 handlers with seeded test DB
- E2E tests: Playwright in apps/web for primary flows
- Contract tests: OpenAPI spec diffing in CI

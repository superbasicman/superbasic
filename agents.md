# SuperBasic Agents Guide

## Mission Snapshot
- API-first personal finance platform; thin React SPA consumes typed `/v1` JSON endpoints.
- Secure by design: Auth.js sessions, hashed PATs, least-privilege Prisma, Upstash-backed rate limits, auditable changes.
- Focus areas for v1: Plaid-powered bank sync, Stripe billing, workspace-scoped multi-tenancy, append-only ledger.
- Non-goals: native mobile clients, full double-entry accounting.

## Monorepo Map
```
. (pnpm workspace + Turborepo)
├─ apps/
│  ├─ api/        # Hono v4 Node adapter, /src/routes/v1/*
│  └─ web/        # Vite + React 19 SPA (API-only data)
├─ packages/
│  ├─ core/       # Domain services + repositories
│  ├─ db/         # Prisma schema, migrations, client
│  ├─ auth/       # Auth.js config, PAT hashing, RBAC scopes
│  ├─ types/      # Shared Zod schemas + OpenAPI contracts
│  ├─ sdk/        # Generated API client
│  ├─ observability/, rate-limit/, design-system/
└─ tooling/
   ├─ ci/         # GitHub Actions + turborepo presets
   └─ scripts/    # Migration + release automation
```

### Conventions
- Route files: `apps/api/src/routes/v1/{resource}.{action}.ts` exporting validation schemas + handler.
- Client stays pure: `apps/web` talks to the API via generated SDK + TanStack Query—no secrets or Prisma.
- Shared packages export named APIs; use path aliases (`@repo/*`), keep files kebab-case, tests in `*.test.ts` or `*.spec.ts`.
- Background jobs: Upstash QStash workers for long syncs, Vercel Cron for short triggers, all idempotent via `processed_events`.

## Tech Stack & Commands
- Backend: Node 20+, Hono, Zod → OpenAPI, Prisma 6 on Neon Postgres, Auth.js, Stripe, Plaid, Upstash Redis/QStash, Vitest.
- Frontend: Vite, React 19, React Router, Tailwind, TanStack Query, Plaid Link; Capacitor-ready architecture.
- Tooling: pnpm workspaces, Turborepo, Biome, tsup, Husky + lint-staged, Playwright (E2E), Changesets (planned).
- Handy commands:
  - `pnpm install`
  - `pnpm dev` / `pnpm dev --filter=api|web`
  - `pnpm build` / `pnpm build --filter=api`
  - `pnpm test`, `pnpm test:unit`, `pnpm test:e2e`
  - `pnpm lint`, `pnpm typecheck`, `pnpm format`
  - `pnpm db:migrate`, `pnpm db:generate`, `pnpm db:studio`
  - `pnpm api:docs`, `pnpm sdk:generate`

## Architecture Guardrails
- Layered pattern for new features (Phase 4+): thin HTTP controllers → services → repositories; existing Phase ≤3 code can stay put unless refactoring explicitly.
- Route handlers parse/validate, call services, translate domain errors to HTTP responses; they never touch Prisma directly.
- Services enforce business rules (uniqueness, scope validation, expiration windows) and emit domain events; repositories stay CRUD-only.
- Keep functions focused (<50 lines, ideally 20–30); prefer early returns and descriptive helpers.
- Domain errors bubble as typed exceptions; map them to HTTP inside controllers.
- Apply dependency injection via constructors to keep services testable; pass repositories, loggers, clock utilities explicitly.
- When forced to diverge, document the reason in code comments and link back to specs or tickets.

## Database Overview
- Postgres on Neon; Prisma 6 strict mode, UUID v4 primary keys, `TIMESTAMPTZ` timestamps, amounts stored as `BIGINT` cents.
- Append-only ledger: base `transactions` never mutate; overlays/audit tables capture adjustments.
- Auth: Auth.js adapter tables (`users`, `accounts`, `sessions`, `verification_tokens`) with hashed identifiers; business logic keys off `profiles.id`.
- Multi-tenancy anchored on `workspaces`, `workspace_members`, `workspace_connection_links` with JSONB scopes and RLS hooks (`app.user_id`, etc.).
- Key domains:
  - **Access**: `api_keys` (hashed tokens + scopes), Stripe subscriptions tied to profiles.
  - **Collaboration**: saved views + share/link tables, account groups with memberships.
  - **Budgeting**: plans → versions → envelopes, with materialized actuals.
  - **Data sync**: `connections`, `accounts`, immutable `transactions`, overlay/audit tables, `sync_sessions` with payload/idempotency tables.
- Hash secrets (tokens, passcodes), rely on partial indexes for active records, prefer TEXT enums guarded by CHECK constraints.

## Delivery Hygiene
- Centralize docs under `docs/` (architecture, guides, api, operations, archived); link new material from `README.md`.
- Temporary scripts live in `scripts/temp/` during work, then get deleted or promoted into `tooling/scripts/` with docs.
- Task wrap-up checklist: clean temp scripts, update docs, remove debug artifacts, verify tests, refresh `.kiro/steering/current-phase.md` + `docs/project_plan.md`.
- Phase completion adds a dedicated `docs/phase-N-readme.md` with sanity checks, deliverables, metrics, lessons, and next-step prep.
- Sanity checks use executable commands (curl/pnpm) with expected outputs and failure cases covering auth, throttling, and main flows.

## References
- Specs: `.kiro/specs/` (see architecture refactor folder for current phase).
- Steering archive: `.kiro/steering/` (source material for this guide).
- Plaid setup: `docs/plaid-setup.md` and tooling script `tooling/scripts/setup-plaid.ts`.
- Project overview: `README.md`, `QUICKSTART.md`, plus package-level READMEs where present.

## Task Tracking Cheat Sheet
- Log future items as numbered checklists using `[ ]` / `[x]` so progress stays easy to scan. Leave out any sensitive data or keys and replace with placheholders
- Template:
  1. [ ] Task name – quick description.
- Sannity Checks: Quick description

# SuperBasic Agents Guide (Lean)

This file has two jobs:
1. **Preamble:** instructions that should be loaded into every chat.
2. **Context map:** where agents should look for deeper docs depending on the task.

---

## 1. Preamble — load this into every chat

You are an AI agent working inside the **SuperBasic Finance** monorepo.

Treat this section as the per-chat system prompt for any work in this repo.

### 1.1 What this project is

- SuperBasic Finance is an **API-first personal finance platform** in a TypeScript **pnpm/Turborepo** monorepo.
- The **web app** is a thin **React SPA** that only talks to a typed **`/v1` JSON API** generated from **Zod → OpenAPI 3.1**.
- **Identity vs domain:**
  - Auth-core owns auth tables (`users`, `accounts`, `sessions`, `verification_tokens`) per `docs/auth-migration/end-auth-goal.md`.
  - Domain starts at `profiles.id` and flows:
    - Profiles own connections (banks) and bank accounts: `profiles → connections → bank_accounts → transactions → overlays`.
    - Workspaces link to connections to decide which banks are available per workspace; views then filter transactions (by accounts, date, name, include/exclude, custom rules).
- **Ledger invariants:**
  - `transactions` are **append-only / immutable**; user edits live in overlay / adjustment tables, not direct row mutation.
  - Everything is **multi-tenant** and protected by **Postgres RLS** using `current_setting('app.user_id'/'app.profile_id'/'app.workspace_id')`.

### 1.2 How to structure code

- Default to a **three-layer architecture**:
  - Thin **Hono route handlers** in `apps/api/src/routes/v1` (HTTP parsing + response mapping only).
  - **Services** in `packages/core` implement business rules and workflows.
  - **Repositories** in `packages/core` handle Prisma CRUD only (no business logic).
- Keep **domain logic** in `packages/core` and surface it via pure functions/classes; apps consume only those.
- Route handlers:
  - Parse/validate with **Zod**.
  - Pull context (`userId`, `profileId`, `workspaceId`, `requestId`).
  - Call services and translate **domain errors → HTTP status codes**.
  - Never talk to Prisma directly.
- Prefer:
  - Small, focused functions (ideally under ~50 lines).
  - Clear, descriptive naming over cleverness.
  - Early returns and small helpers instead of deep nesting.

### 1.3 How to work on tasks

- Before coding a non-trivial change:
  - Skim the **Context Map** below and open the relevant doc(s) for your task.
  - Respect the current phase and scope in `.scope/` and specs under `docs/`.
- For larger tasks:
  - Break work into **small, numbered checklist items** in `.scope/tasks/` with quick sanity checks with a context section on top.
    - Use the explicit format: `- [ ] 1. Task title` followed by an indented `- Sanity check: ...` line so it’s obvious how each step is validated.
    - Every item must include a sanity check describing how to confirm completion (command, test, manual verification, etc.).
  - Keep related docs (specs, readmes) up to date as part of the change.
- When changing schema, contracts, or invariants:
  - Update or propose changes in the **schema / API docs first**, then update code and tests to match.

### 1.4 Safety, security & boundaries

- **Git / repo control**
  - Do **not** run mutating git commands (`git add`, `commit`, `push`, `merge`, etc.). The user owns git history.
  - Reading commands like `git status` / `git diff` for context is fine if needed.
- **Secrets**
  - Never introduce real API keys, tokens, or credentials into code, examples, or docs.
  - Always use clear placeholders (for example: `sk_test_your_key_here`, `PLAID_SECRET=your_secret_here`).
  - Scripts should require env vars; no hard-coded secrets or fallbacks.
- **Security invariants**
  - Never bypass RLS or add cross-tenant queries.
  - Never touch the database directly from `apps/web` or ship secrets to the browser.
  - Keep Stripe/Plaid and other providers **server-side**; the browser only sees public tokens or Link flows.
- **UI / dependencies**
  - Do not add new third-party UI libraries to the design system unless explicitly requested.
  - Use existing Tailwind-based design system components and patterns.

### 1.5 Tests, tooling & execution hygiene

- When adding or changing behavior:
  - Add or update tests at the correct layer (unit in `packages/core`, integration in `apps/api`, E2E in `apps/web`) rather than leaving logic untested.
- When running tests in a non-interactive/agent context:
  - Use `pnpm test -- --run` (or equivalent) so Vitest does **not** start in watch/interactive mode.
- Keep **docs, types, and implementations in sync**:
  - Database: match Prisma schema, migrations, and `database-structure-*.md`.
  - API: match Zod schemas, handlers, OpenAPI spec, and SDK.
- Prefer **small, incremental changes** with clear sanity checks over large, sweeping refactors—unless the user explicitly asks for one.
- Per-package scripts:
  - Packages that don't define a script (for example `tsc`) still run the underlying tool via `pnpm --filter <package> exec <command>`.
  - Example: `pnpm --filter @repo/auth-core exec tsc --noEmit` instead of `pnpm --filter @repo/auth-core tsc --noEmit`.
  - Turbo-powered commands (`pnpm lint`, `pnpm test`, etc.) fan out automatically; prefer the scoped `--filter` + `exec` form when you only need a single workspace.

---

## 2. Context Map — what to read for specific work

Use this as a routing table for deeper context. Open only the docs relevant to the task at hand.

> Paths are indicative; adjust to your actual repo layout (for example, under `agent/steering/`).

### 2.1 Planning, phases & coordination

- **If you are planning work, scoping a feature, or organizing tasks**, refer to:
  - `agent/steering/planning-and-overview.md` — how to write tasks, use `.scope/`, and keep plans sane.

### 2.2 Architecture, monorepo layout & code organization

- **If you are reasoning about overall architecture or monorepo layout**, refer to:
  - for ONLY high-level architecture and organization principles: `agent/steering/architecture-overview.md`.
  - for layered patterns, SRP, and where domain logic lives: `agent/steering/code-organization-and-architecture.md`.

### 2.3 HTTP API design & contracts

- **If you are changing or adding `/v1` endpoints or contracts**, refer to:
  - `agent/steering/api-contracts.md` — Zod schemas, OpenAPI contracts, and versioning rules.
  - `agent/steering/route-handlers.md` — thin controller pattern for Hono route handlers.
  - `agent/steering/services-repositories-and-di.md` — service / repository patterns and dependency injection.

### 2.4 Domain services, errors & package structure

- **If you are working inside `packages/core` (services, repositories, domain types)**, refer to:
  - `agent/steering/services-repositories-and-di.md` — how to design services and repositories.
  - `agent/steering/domain-errors-and-package-structure.md` — domain error patterns and per-domain folder layout.

### 2.5 Background jobs, sync & workers

- **If you are working on Plaid sync, QStash workers, or cron jobs**, refer to:
  - `agent/steering/background-workflows.md` — QStash usage, sync session cursors, idempotency, and retry patterns.

### 2.6 Database schema & RLS

- **If you are changing schema, queries, or RLS**, refer to:
  - `agent/steering/database/database-structure-reference.md` — start here to find the precise `database-structure-*.md` slice you need.
  - The specific files under `agent/steering/database/` (for example `database-structure-connections-and-ledger.md`, `database-structure-rls-and-access-control.md`, etc.) — canonical schema slices, constraint details, RLS rules, and SQL helpers.
- Always ensure changes respect:
  - Append-only `transactions`.
  - RLS policies keyed off `app.user_id`, `app.profile_id`, `app.workspace_id`.

### 2.7 Testing, observability & ops

- **If you are adding tests, logs, or operational checks**, refer to:
  - `agent/steering/testing-observability-and-ops.md` — testing strategy by layer, observability patterns, and operational hygiene.

### 2.8 Security, secrets & git workflow

- **If you are touching auth, secrets, or CI/CD, or need collaboration norms**, refer to:
  - `agent/steering/security-and-secrets-management.md` — secret handling, security expectations, and compliance-style guardrails.
  - `agent/steering/git-workflow-and-culture.md` — how to think about branches, PRs, and collaboration patterns (with the user owning actual git commands).

### 2.9 Delivery hygiene, tasks & commands

- **If you are wrapping up a change, documenting, or need common commands**, refer to:
  - `agent/steering/delivery-hygiene-and-task-tracking.md` — docs locations, task wrap-up checklists, and how to track tasks.
  - `agent/steering/tech-stack-and-commands.md` — quick reference for backend/frontend stack and standard `pnpm` commands.

### 2.10 Code quality & implementation guardrails

- **If you need general coding standards, readability guidelines, or reminders on layering discipline**, refer to:
  - `agent/steering/code-quality.md` — code style expectations, error-handling rules, and testing hygiene.

### 2.11 Auth architecture & migrations

- **If you are working on auth flows, tokens, or migration planning**, start with `docs/auth-migration/end-auth-goal.index.md` to jump to the right section of `docs/auth-migration/end-auth-goal.md`.

When in doubt, start from the smallest relevant doc in this map instead of reading everything. If specs and reality diverge, update the spec as part of the change and call that out in your notes.

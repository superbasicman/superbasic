# SuperBasic Context Map

Use this as a routing table for deeper context. Open only the docs relevant to the task at hand.

> Paths are indicative; adjust to your actual repo layout (for example, under `agent/steering/`).

### Architecture, monorepo layout & code organization

- **If you are reasoning about overall architecture or monorepo layout**, refer to:
  - for ONLY high-level architecture and organization principles: `agent/steering/architecture-overview.md`.
- for layered patterns, SRP, and where domain logic lives: `agent/steering/code-organization-and-architecture.md`.

### HTTP API design & contracts

- **If you are changing or adding `/v1` endpoints or contracts**, refer to:
  - `agent/steering/api-contracts.md` — Zod schemas, OpenAPI contracts, and versioning rules.
  - `agent/steering/route-handlers.md` — thin controller pattern for Hono route handlers.
  - `agent/steering/services-repositories-and-di.md` — service / repository patterns and dependency injection.

### Domain services, errors & package structure

- **If you are working inside `packages/core` (services, repositories, domain types)**, refer to:
  - `agent/steering/services-repositories-and-di.md` — how to design services and repositories.
  - `agent/steering/domain-errors-and-package-structure.md` — domain error patterns and per-domain folder layout.

### Background jobs, sync & workers

- **If you are working on Plaid sync, QStash workers, or cron jobs**, refer to:
  - `agent/steering/background-workflows.md` — QStash usage, sync session cursors, idempotency, and retry patterns.

### Database schema & RLS

- **If you are changing schema, queries, or RLS**, refer to:
  - `agent/steering/database/database-structure-reference.md` — start here to find the precise `database-structure-*.md` slice you need.
  - The specific files under `agent/steering/database/` (for example `database-structure-connections-and-ledger.md`, `database-structure-rls-and-access-control.md`, etc.) — canonical schema slices, constraint details, RLS rules, and SQL helpers.
- Always ensure changes respect:
  - Append-only `transactions`.
  - RLS policies keyed off `app.user_id`, `app.profile_id`, `app.workspace_id`.

### Testing, observability & ops

- **If you are adding tests, logs, or operational checks**, refer to:
  - `agent/steering/testing-observability-and-ops.md` — testing strategy by layer, observability patterns, and operational hygiene.

### Security, secrets & git workflow

- **If you are touching auth, secrets, or CI/CD, or need collaboration norms**, refer to:
  - `agent/steering/security-and-secrets-management.md` — secret handling, security expectations, and compliance-style guardrails.
  - `agent/steering/git-workflow-and-culture.md` — how to think about branches, PRs, and collaboration patterns (with the user owning actual git commands).

### Delivery hygiene, tasks & commands

- **If you are wrapping up a change, documenting, or need common commands**, refer to:
  - `agent/steering/delivery-hygiene-and-task-tracking.md` — docs locations, task wrap-up checklists, and how to track tasks.
  - `agent/steering/tech-stack-and-commands.md` — quick reference for backend/frontend stack and standard `pnpm` commands.

### Code quality & implementation guardrails

- **If you need general coding standards, readability guidelines, or reminders on layering discipline**, refer to:
  - `agent/steering/code-quality.md` — code style expectations, error-handling rules, and testing hygiene.

### Auth architecture & migrations

- **If you are working on auth flows, tokens, or migration planning**, start with `docs/auth-migration/end-auth-goal.index.md` to jump to the right section of `docs/auth-migration/end-auth-goal.md`.

When in doubt, start from the smallest relevant doc in this map instead of reading everything. If specs and reality diverge, update the spec as part of the change and call that out in your notes.

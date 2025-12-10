<!-- source: agents.md -->

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
  - Auth-core owns auth tables (`users`, `accounts`, `sessions`, `verification_tokens`) per `docs/auth-migration/end-auth-goal.md`; no Auth.js adapter or legacy compatibility is needed in this repo.
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
  - Break work into **small, numbered checklist items** in `.scope/tasks/` with quick sanity checks.
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

When in doubt, start from the smallest relevant doc in this map instead of reading everything. If specs and reality diverge, update the spec as part of the change and call that out in your notes.


---

<!-- source: steering/api-contracts.md -->

# API Contracts & Versioning

## API Contracts

- Use Zod schemas for every handler input/output; derive TypeScript types and OpenAPI spec from them.
- Snapshot OpenAPI output in CI and review diffs on PRs.
- Version routes under `/v1`; only non-breaking additions are allowed within the same version.
- Treat OpenAPI as the source of truth for the public surface area; keep it in sync with implementation.


---

<!-- source: steering/architecture-overview.md -->

# Architecture Overview & Organization

## Organization Principles

- Keep domain logic in `packages/core` and surface it via pure functions; apps consume only those APIs.
- Restrict `apps/web` to SDK/API calls—lint or CI should fail on direct DB imports.
- Favor composable Hono middlewares for CORS, rate limits, and auth; avoid bespoke wrappers unless necessary.
- Centralize secret parsing in server-only modules (`apps/api`, `packages/auth`, etc.); never surface secrets in `apps/web` or anything shipped to the browser.

## Layered Architecture Pattern (Target State)

Follow a strict three-layer architecture for API features:

```
┌─────────────────────────────────────────────────────────┐
│ apps/api/src/routes/v1/                                 │
│ HTTP LAYER (Controllers)                                │
│ - Parse/validate HTTP requests                          │
│ - Call service layer methods                            │
│ - Format HTTP responses                                 │
│ - Handle HTTP-specific errors (4xx, 5xx)               │
│ - Apply middleware (auth, rate limits, validation)     │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ packages/core/src/{domain}/                            │
│ BUSINESS LOGIC LAYER (Services)                        │
│ - Implement business rules and workflows               │
│ - Orchestrate multiple repository calls                │
│ - Validate business constraints                        │
│ - Emit domain events for audit logging                 │
│ - Return domain objects (not HTTP responses)           │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ packages/core/src/{domain}/                            │
│ DATA ACCESS LAYER (Repositories)                       │
│ - Pure Prisma operations (CRUD only)                   │
│ - No business logic or validation                      │
│ - Return database entities                             │
│ - Handle database-specific errors                      │
└─────────────────────────────────────────────────────────┘
```

## Single Responsibility Principle (SRP)

**Each function should have ONE clear responsibility:**

- **Route handlers**: Parse request → Call service → Format response
- **Services**: Implement ONE business operation (e.g. `createToken`, `syncTransactions`, `calculateBudget`)
- **Repositories**: Perform ONE database operation (`findById`, `create`, `update`, `delete`)
- **Utilities**: Perform ONE pure function (`hashToken`, `formatCurrency`, `validateEmail`)

**Keep functions focused and short:**

- Aim for functions under ~50 lines (ideally 20–30).
- If a function does multiple things, extract helper functions.
- Use early returns to reduce nesting.
- Extract complex conditionals into named boolean helpers.

## When to Deviate from This Pattern

**For new features ask: “Will this need business logic later?”**

- If **yes**, use the full layered pattern from the start.
- If **no**, keep it simple but document the decision and rationale.


---

<!-- source: steering/background-workflows.md -->

# Background Workflows & Sync

## Background Workflows

- Use Upstash QStash for long-running Plaid syncs or other long-running jobs.
- Chunk work so each handler finishes well under the Vercel (or hosting) free tier timeout.
- Persist sync cursors and statuses in `sync_sessions`; re-queue jobs defensively on failure.
- Batch manual “Sync Now” requests and rely on frontend polling; never block a request on the entire sync finishing.
- Prefer idempotent handlers and explicit retry policies for background work.


---

<!-- source: steering/code-organization-and-architecture.md -->

# Architecture Overview & Code Organization

## Organization Principles

- Keep domain logic in `packages/core` and surface it via pure functions; apps consume only those APIs.
- Restrict `apps/web` to SDK/API calls—lint or CI should fail on direct DB imports.
- Favor composable Hono middlewares for CORS, rate limits, and auth; avoid bespoke wrappers unless necessary.
- Centralize secret parsing in server-only modules (`apps/api`, `packages/auth`, etc.); never surface secrets in `apps/web` or anything shipped to the browser.

## Layered Architecture Pattern (Target State)

Follow a strict three-layer architecture for API features:

```text
┌─────────────────────────────────────────────────────────┐
│ apps/api/src/routes/v1/                                 │
│ HTTP LAYER (Controllers)                                │
│ - Parse/validate HTTP requests                          │
│ - Call service layer methods                            │
│ - Format HTTP responses                                 │
│ - Handle HTTP-specific errors (4xx, 5xx)                │
│ - Apply middleware (auth, rate limits, validation)      │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ packages/core/src/{domain}/                            │
│ BUSINESS LOGIC LAYER (Services)                        │
│ - Implement business rules and workflows               │
│ - Orchestrate multiple repository calls                │
│ - Validate business constraints                        │
│ - Emit domain events for audit logging                 │
│ - Return domain objects (not HTTP responses)           │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ packages/core/src/{domain}/                            │
│ DATA ACCESS LAYER (Repositories)                       │
│ - Pure Prisma operations (CRUD only)                   │
│ - No business logic or validation                      │
│ - Return database entities                             │
│ - Handle database-specific errors                      │
└─────────────────────────────────────────────────────────┘
```

## Single Responsibility Principle (SRP)

**Each function should have ONE clear responsibility:**

- **Route handlers**: Parse request → Call service → Format response  
- **Services**: Implement ONE business operation (e.g. `createToken`, `syncTransactions`, `calculateBudget`)  
- **Repositories**: Perform ONE database operation (`findById`, `create`, `update`, `delete`)  
- **Utilities**: Perform ONE pure function (`hashToken`, `formatCurrency`, `validateEmail`)

**Keep functions focused and short:**

- Aim for functions under ~50 lines (ideally 20–30).
- If a function does multiple things, extract helper functions.
- Use early returns to reduce nesting.
- Extract complex conditionals into named boolean helpers.

## Route Handler Pattern (HTTP Layer)

**Route handlers should be thin controllers:**

```typescript
// ✅ GOOD - Thin controller
export const createTokenRoute = new Hono<AuthContext>();

createTokenRoute.post(
  "/",
  authMiddleware,
  rateLimitMiddleware,
  zValidator("json", CreateTokenSchema),
  async (c) => {
    const userId = c.get("userId");
    const profileId = c.get("profileId");
    const data = c.req.valid("json");

    try {
      // Call service layer - business logic lives there
      const result = await tokenService.createToken({
        userId,
        profileId,
        ...data,
      });

      // Format HTTP response
      return c.json(result, 201);
    } catch (error) {
      // Handle domain errors → HTTP errors
      if (error instanceof DuplicateTokenNameError) {
        return c.json({ error: error.message }, 409);
      }
      if (error instanceof InvalidScopesError) {
        return c.json({ error: error.message }, 400);
      }
      throw error; // Let global error handler catch unexpected errors
    }
  }
);
```

```typescript
// ❌ BAD - Fat controller with business logic and DB access
createTokenRoute.post("/", async (c) => {
  const userId = c.get("userId");
  const { name, scopes, expiresInDays } = await c.req.json();

  // ❌ Validation in controller
  if (!validateScopes(scopes)) {
    return c.json({ error: "Invalid scopes" }, 400);
  }

  // ❌ Database access in controller
  const existing = await prisma.apiKey.findUnique({
    where: { userId_name: { userId, name } },
  });

  if (existing) {
    return c.json({ error: "Duplicate name" }, 409);
  }

  // ❌ Business logic in controller
  const record = await prisma.example.create({
    data: { userId, name },
  });

  return c.json(record, 201);
});
```

## Service Layer Pattern (Business Logic)

**Services implement business operations as pure functions or classes (generic example):**

```typescript
export class ExampleService {
  constructor(
    private repo: ExampleRepository,
    private auditLogger: AuditLogger
  ) {}

  async createExample(params: CreateExampleParams): Promise<ExampleResult> {
    const record = await this.repo.create(params);
    await this.auditLogger.logExampleCreated({ id: record.id });
    return mapToDto(record);
  }
}
```

**Or use functional style for simpler operations:**

```typescript
// packages/core/src/tokens/token-operations.ts

export async function createToken(
  params: CreateTokenParams,
  deps: { tokenRepo: TokenRepository; auditLogger: AuditLogger }
): Promise<CreateTokenResult> {
  // Same logic as class-based approach
  // Use this style for simpler, stateless operations
}
```

## Repository Pattern (Data Access)

**Repositories handle ONLY database operations:**

```typescript
export class ExampleRepository {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateExampleData): Promise<ExampleRecord> {
    return this.prisma.example.create({ data });
  }

  async findById(id: string): Promise<ExampleRecord | null> {
    return this.prisma.example.findUnique({ where: { id } });
  }
}
```

## Domain Errors Pattern

**Create custom error classes for business rule violations:**

```typescript
export class DomainError extends Error {}

export class DuplicateNameError extends DomainError {
  constructor(name: string) {
    super(`Name "${name}" already exists`);
    this.name = "DuplicateNameError";
  }
}
```

## Package Structure for Domain Logic

```text
packages/core/src/
├─ tokens/
│  ├─ token-service.ts             # Business logic
│  ├─ token-repository.ts          # Data access
│  ├─ token-errors.ts              # Domain errors
│  ├─ token-types.ts               # Domain types
│  ├─ index.ts                     # Public exports
│  └─ __tests__/
│     ├─ token-service.test.ts     # Unit tests (no DB)
│     └─ token-repository.test.ts  # Integration tests (with DB)
├─ connections/
│  ├─ connection-service.ts
│  ├─ connection-repository.ts
│  └─ ...
├─ transactions/
│  ├─ transaction-service.ts
│  ├─ transaction-repository.ts
│  └─ ...
└─ budgets/
   ├─ budget-service.ts
   ├─ budget-repository.ts
   └─ ...
```

## Dependency Injection Pattern (Target State)

**Use constructor injection for testability in new features:**

```typescript
// apps/api/src/services/index.ts (does not exist yet - create when needed)

import { prisma } from "@repo/database";
import { ConnectionRepository, ConnectionService } from "@repo/core";
import { auditLogger } from "@repo/observability";

// Create repository instances
export const connectionRepository = new ConnectionRepository(prisma);

// Create service instances with dependencies
export const connectionService = new ConnectionService(
  connectionRepository,
  auditLogger
);
```

```typescript
// apps/api/src/routes/v1/connections/create.ts (example for Phase 4+)

import { connectionService } from "../../../services/index.js";

createConnectionRoute.post("/", async (c) => {
  // Use injected service
  const result = await connectionService.createConnection({ /* ... */ });
  return c.json(result, 201);
});
```

## When to Deviate from This Pattern

**For new features ask: “Will this need business logic later?”**

- If **yes**, use the full layered pattern from the start.
- If **no**, keep it simple but document the decision and rationale.


---

<!-- source: steering/code-quality.md -->

# Code Quality & Implementation Guardrails

These habits keep SuperBasic code readable, predictable, and easy to change.

## 1. General principles

- Prefer clarity over cleverness: name things after their domain concepts and delete ambiguous abbreviations.
- Keep functions focused: if a function handles parsing, validation, and persistence, break it into helpers.
- Default to pure functions for business logic; isolate side effects (I/O, logging, metrics) so they are easy to test.
- Lean on TypeScript’s types and Zod schemas instead of runtime checks scattered through code.

## 2. Implementation habits

- Respect the three-layer architecture: routes → services → repositories. Crossing layers is a last resort and must be documented.
- Avoid deep nesting; use early returns and guard clauses for error paths.
- Prefer composition over inheritance—small utilities wired together beat fragile base classes.
- Keep modules under ~200 lines. Split files when a domain concept expands.
- Comment only when intent is non-obvious (for example, describing a gnarly RLS workaround). Do not comment obvious assignments or control flow.

## 3. Error handling & observability

- Translate domain errors to HTTP responses in handlers; never leak raw Prisma or provider errors to clients.
- Use structured logging helpers so every log includes `requestId`, `userId`, `profileId`, and `workspaceId` when available.
- When catching an error, either handle it fully or rethrow; never swallow errors silently.
- Guard against partial writes by wrapping multi-step mutations in services with transactions.

## 4. Testing expectations

- Add the smallest useful test at the layer where the change lives:
  - Repositories → unit tests against Prisma test DB or mocks.
  - Services → unit tests with repository fakes.
  - Routes → API/Vitest integration tests.
- For bug fixes, add a regression test that fails before the fix and passes after.
- Keep test data builders next to the domains they model; avoid copy/pasting fixtures across packages.

## 5. Change hygiene

- Update docs/specs alongside code so reviewers don’t need to guess intent.
- When touching public contracts (API, SDK, database), note the change in the relevant doc before coding.
- Prefer multiple small PRs/tasks over one giant drop; call out TODOs that should become future work instead of leaving half-finished ideas in code.


---

<!-- source: steering/database/database-structure-budgets.md -->

agent/steering/database-structure-budgets.md
# Database Structure — Budgets (Plans, Versions, Envelopes, Actuals)

This file covers:

- How budgets attach to categories and workspaces
- `budget_plans`, `budget_versions`, `budget_envelopes`
- `budget_actuals` (materialized aggregates) and its refresh pipeline
- Currency rules and rollup modes
- How category resolution feeds budget aggregates

Use this when you are working on budgeting features, budget UIs, or any reporting built on `budget_actuals`.

For category precedence and helpers:
- See `database-structure-categories-and-resolution.md`.

For RLS and raw SQL policies:
- See `database-structure-rls-and-access-control.md` and `database-structure-rls-policies-and-ddl.sql.md`.

---

## 1. Conceptual Model

Budgets anchor to category metadata:

- Authoring:
  - Plan and envelope definitions reference `categories.id` (system or profile) for ownership/labeling.
- Runtime:
  - The actuals pipeline resolves every transaction through the canonical category precedence chain:
    - `transaction_overlays.category_id`
    - `view_category_overrides`
    - `workspace_category_overrides`
    - `profile_category_overrides`
    - `transactions.system_category_id`
  - The pipeline then persists the resulting `workspace_category_id` into `budget_actuals`.

Key consequence:

- Authoring uses the shared system/profile and workspace category trees.
- What end users see in budget UIs always reflects the effective workspace category after overrides have been applied.

---

## 2. budget_plans

Table: `budget_plans`

Purpose:

- Top-level budget plans scoped to a workspace.
- Define:
  - Name and base currency.
  - Rollup behavior.
  - View filter linkage (snapshot vs live).
  - Template behavior.

Core columns:

- `id` — UUID PK.
- `workspace_id` — FK to `workspaces(id)` NOT NULL.
- `owner_profile_id` — FK to `profiles(id)` NOT NULL.
- `name` — TEXT.
- `currency` — `VARCHAR(3) CHECK (char_length(currency) = 3)`:
  - Plan currency; must match workspace default currency (see trigger below).
- `rollup_mode` — TEXT with CHECK:
  - `CHECK (rollup_mode IN ('posted','authorized','both'))`
  - Governs which transaction fields contribute to actuals:
    - `posted`: only posted transactions.
    - `authorized`: only authorized amounts.
    - `both`: both posted and authorized tracked separately.
- `view_id` — FK to `saved_views(id)` NULL:
  - Optional pointer to a saved view whose filters define scope.
- `view_filter_snapshot` — JSONB:
  - Snapshot of view filters taken at plan/version creation time.
  - Used to freeze the plan’s filter semantics even if the underlying view changes.
- `view_filter_hash` — TEXT:
  - Hash of the snapshot or live view filter configuration for change detection.
- `is_template` — BOOL DEFAULT `false`:
  - Marks a plan as a template for reuse instead of a live budget.
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.
- `deleted_at` — TIMESTAMPTZ NULL:
  - Soft deletion; plan considered archived when non-NULL.

Currency enforcement:

- Constraint trigger: `budget_plans_enforce_currency` (BEFORE INSERT/UPDATE):
  - Ensures:

    - `budget_plans.currency = workspaces.settings->>'default_currency'`.

  - Mixed-currency plans are not supported in v1.
- FX support:
  - Explicitly future work.
  - v1 budgets reject:
    - Any attempt to mix currencies within a plan.
    - Any attempt to override `workspace.settings->>'default_currency'` for a plan.

RLS implications:

- A plan is visible only to members of the associated workspace.
- Write operations (create/update/delete) restricted to elevated roles (owner/admin).
- See `budget_plans_membership` policy in `database-structure-rls-policies-and-ddl.sql.md`.

---

## 3. budget_versions

Table: `budget_versions`

Purpose:

- Versioning for a budget plan.
- Supports time-ranged versions and period semantics (monthly, weekly, custom).
- Allows carryover behavior to change over time.

Core columns:

- `id` — UUID PK.
- `plan_id` — FK to `budget_plans(id)` NOT NULL.
- `version_no` — INT NOT NULL:
  - Version number per plan (monotonically increasing).
- `effective_from` — DATE NOT NULL:
  - Start date for this version’s validity.
- `effective_to` — DATE NULL:
  - End date (exclusive or inclusive depending on app semantics).
  - NULL may represent “open-ended” or “current” version.
- `period` — TEXT with CHECK:
  - `CHECK (period IN ('monthly','weekly','custom'))`
  - Defines how `period` buckets are computed for actuals.
- `carryover_mode` — TEXT with CHECK:
  - `CHECK (carryover_mode IN ('none','envelope','surplus_only','deficit_only'))`
  - Controls how unused/overused amounts roll forward between periods.
- `notes` — TEXT, optional.
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Uniqueness:

- `UNIQUE (plan_id, version_no)`
  - Each plan has distinct version numbers.

RLS implications:

- Visibility and write access flow through the associated `budget_plans.workspace_id`.
- See `budget_versions_membership` policy.

---

## 4. budget_envelopes

Table: `budget_envelopes`

Purpose:

- Per-category (or arbitrary label) envelope definitions within a version:
  - Envelope label.
  - Limit in cents.
  - Optional group label and metadata.
  - Optional direct link to a category.

Core columns:

- `id` — UUID PK.
- `version_id` — FK to `budget_versions(id)` NOT NULL.
- `category_id` — FK to `categories(id)` NULL:
  - Optional system/profile category linkage for authoring.
  - Envelopes may be generic labels (no category_id) or explicitly tied to a category.
- `label` — TEXT:
  - Human-readable name for the envelope (e.g., “Groceries”, “Rent”).
- `limit_cents` — BIGINT NOT NULL:
  - Envelope budget limit in cents.
  - **Important:** This is the only standalone `*_cents` column without a paired `currency` column:
    - Its currency is always equal to `budget_plans.currency`, enforced indirectly by `budget_plans_enforce_currency`.
- `warn_at_pct` — INT DEFAULT 80:
  - Threshold (0–100) for warning when utilization reaches this percentage.
- `group_label` — TEXT NULL:
  - Optional UI grouping for envelopes (e.g. “Essentials”, “Savings”).
- `metadata` — JSONB:
  - Arbitrary extra configuration/metadata for the envelope.
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.
- `deleted_at` — TIMESTAMPTZ NULL:
  - Soft-delete marker.

Indexes:

- Index on `(version_id)` for listing envelopes per version.
- Index on `(category_id)` for category-related lookups.

Currency semantics:

- Implicitly uses the `budget_plans.currency` of its parent plan.
- No additional currency column may be added to this table; `(limit_cents, budget_plans.currency)` is treated as its logical money pair.

RLS implications:

- Access flows through `budget_versions.plan_id → budget_plans.workspace_id`.
- See `budget_envelopes_membership` policy.

---

## 5. budget_actuals (Materialized Aggregates)

Table: `budget_actuals`

Purpose:

- Stores precomputed actuals for each (plan, version, envelope, period) combination.
- Designed as a real table (not a built-in materialized view) so RLS can be enforced directly.

Core concepts:

- Each row corresponds to:
  - A specific plan and version.
  - A specific envelope.
  - A specific date bucket (“period”).
  - The aggregated posted/authorized amounts for that bucket under the plan’s view/scope rules.

Core columns (schema):

- `plan_id` — UUID NOT NULL:
  - Denormalized from `budget_plans.id`.
- `version_id` — UUID NOT NULL:
  - Denormalized from `budget_versions.id`.
- `envelope_id` — UUID NOT NULL:
  - Denormalized from `budget_envelopes.id`.
- `workspace_id` — UUID NOT NULL:
  - Denormalized from `budget_plans.workspace_id`.
  - Used for RLS and partitioning.
- `period` — DATE NOT NULL:
  - Derived period bucket (e.g., day representing a month).
- `currency` — `VARCHAR(3)` NOT NULL:
  - Copy of `budget_plans.currency`.
- `rollup_mode` — TEXT NOT NULL:
  - Copy of `budget_plans.rollup_mode` or `budget_versions` semantics.
- `posted_amount_cents` — BIGINT NOT NULL DEFAULT 0:
  - Sum of `transactions.amount_cents` for posted transactions that match the plan and envelope rules when rollup_mode includes posted.
- `authorized_amount_cents` — BIGINT NOT NULL DEFAULT 0:
  - Sum of `transactions.amount_cents` for authorized-only transactions that match the plan and envelope rules when rollup_mode includes authorized.
- `workspace_category_id` — UUID NULL:
  - Effective `workspace_categories.id` for this envelope/period after applying view/workspace overrides and category resolution.
- `updated_at` — TIMESTAMPTZ NOT NULL:
  - Last refresh time for this row.

Additional required indexes:

- `CREATE INDEX budget_actuals_version_period_idx ON budget_actuals(version_id, period);`
- `CREATE INDEX budget_actuals_plan_version_period_idx ON budget_actuals(plan_id, version_id, period);`
- `CREATE INDEX budget_actuals_workspace_period_idx ON budget_actuals(workspace_id, period);`

Exposure to callers:

- Optionally exposed via a thin view:

  - `CREATE VIEW budget_actuals_mv AS SELECT * FROM budget_actuals;`

- RLS policies must be defined on the `budget_actuals` table itself; the view is a passthrough alias only.

---

## 6. budget_actuals Refresh Pipeline

The refresh pipeline is responsible for materializing data into `budget_actuals`. It is implemented in application/tooling code (e.g., `tooling/scripts/refresh-budget-actuals.ts`) and respects currencies, scopes, and category resolution.

### 6.1 General Behavior

- `budget_actuals` is maintained by a refresh job that:
  - Truncates and reinserts rows for affected scopes; or
  - Uses a more granular update strategy in the future (implementation detail).
- Running cadence:
  - Nightly at minimum.
  - Also triggered after:
    - Envelope writes (changes to `budget_envelopes`).
    - Relevant transaction writes (`transactions` or `transaction_overlays`).
- For each (plan, version, envelope) combination, and for each period:
  - It computes the aggregated amounts and writes them to `budget_actuals`.

### 6.2 Currency and rollup rules

- `budget_plans_enforce_currency` ensures:
  - `budget_plans.currency = workspaces.settings->>'default_currency'`.
- During refresh:
  - Transactions whose currency is not equal to the plan/workspace currency are ignored until FX support is implemented.
  - rollup_mode influences:
    - Which transactions are included:
      - `posted`: use posted transactions only.
      - `authorized`: use authorized-only transactions.
      - `both`: track both separately, abiding by plan semantics.

### 6.3 Workspace and account scoping

The aggregation respects workspace-level access constraints:

- Filters out transactions from accounts the workspace is not allowed to see by relying on:

  - `workspace_connection_links.account_scope_json`
  - `workspace_allowed_accounts`
  - Workspace membership (via `workspace_members`)

- RLS helpers and/or dedicated query helpers parallel the same checks `transactions` use for workspace access, so:

  - Unauthorized accounts never contribute to budget_actuals.

### 6.4 Category resolution in budget_actuals

- The refresh pipeline uses workspace-oriented category resolution:

  - Uses `effective_workspace_category(transaction_id, workspace_id, view_id)` to fold in system + workspace + view overrides while staying profile-agnostic.

- For profile-specific views:
  - `budget_actuals` stays profile-agnostic.
  - Profile overlays and profile_category_overrides are resolved at query time via `effective_transaction_category(...)` when presenting personalized UI (not written into `budget_actuals`).

- Derived `workspace_category_id`:
  - The result of applying `effective_workspace_category(...)` for a given transaction and workspace (optionally with view_id).
  - Used for grouping and aggregation in budgets.

### 6.5 Period derivation

Period is derived from transaction timestamps and workspace/profile timezone:

- `period := (posted_at AT TIME ZONE workspace_tz)::date`
- Where:

  - `workspace_tz = COALESCE(
       workspaces.settings->>'timezone',
       owner_profile.timezone,
       'UTC'
    )`

Requirements:

- All budget refreshers and ad-hoc reporting queries must reuse this exact expression.
- This guarantees that a transaction appears in the same DATE bucket across all views and reports.

### 6.6 Filters and snapshots

Filters applied during refresh:

- Resolve filters via:

  - `view_id` (live filters from the associated saved view), or
  - `view_filter_snapshot` (frozen filters from `budget_plans`).

- Typical strategy:
  - If `view_filter_snapshot` is present:
    - Prefer the snapshot for deterministic behavior.
  - Otherwise:
    - Use the current filters of `view_id`.

### 6.7 RLS and materialization

- Postgres cannot enforce RLS on built-in materialized views; thus:

  - `budget_actuals` is a normal table with RLS.
  - Any `budget_actuals_mv` view is a simple `SELECT * FROM budget_actuals`.

- RLS policies on `budget_actuals` ensure:

  - Only members of a workspace can see rows for that workspace.
  - No cross-workspace leakage.

### 6.8 Partitioning

- v1 shipping target:

  - Single `budget_actuals` table with the indexes described above.

- Future partitioning:

  - `workspace_id` and `period` are denormalized specifically so that:
    - `(workspace_id, period)` partitions can be introduced later without reshaping data.
  - Partitioning is not required today but is forward-compatible.

---

## 7. Computation Notes (Summary from §11)

This section collects the key invariants from the dedicated computation notes:

- `budget_actuals` stores:
  - `(plan_id, version_id, envelope_id, period)` as its core key.
- Filters:
  - Resolve via `view_id` or `view_filter_snapshot`, aligning with the plan’s configuration.
- Account scope:
  - Always apply `workspace_connection_links.account_scope_json` (and its normalized `workspace_allowed_accounts` projection).
- Aggregation:
  - Sum `transactions.amount_cents` by posted date, honoring `rollup_mode`.
- Currency:
  - Ignore transactions whose currency does not match the plan/workspace currency until FX support exists.
- Refresh cadence:
  - Nightly and on relevant writes (transactions or envelopes).
  - Must maintain required indexes on `(version_id, period)` and related keys.
- Legacy name:
  - `CREATE VIEW budget_actuals_mv AS SELECT * FROM budget_actuals` is supported for callers expecting that name.
  - RLS remains on the underlying table.

---

## 8. RLS and Access (High-Level)

Detailed RLS policies live in `database-structure-rls-policies-and-ddl.sql.md`. High-level behavior:

- `budget_plans`:
  - SELECT allowed for workspace members.
  - INSERT/UPDATE/DELETE allowed to owners/admins of the workspace.
- `budget_versions`, `budget_envelopes`:
  - Visibility flows through `budget_plans.workspace_id`.
  - Writes restricted to owners/admins (and possibly editors depending on policy).
- `budget_actuals`:
  - SELECT allowed only if:
    - The profile is a member of `budget_plans.workspace_id`.
    - Plan is not soft-deleted.

Any changes to budget behavior must ensure:

- Currency enforcement (`budget_plans_enforce_currency`) remains correct.
- Category resolution continues to use the canonical helpers (`effective_workspace_category`, `effective_transaction_category`).
- RLS policies and indexes remain in sync with the access model.
- The refresh pipeline and computation tests (see `database-structure-migrations-ops-and-testing.md`) still pass.

---

## 9. When Updating Budget Logic

If you modify any budget-related schema or behavior:

1. Update this file to reflect the new shape/semantics.  
2. Update:
   - `database-structure-categories-and-resolution.md` if category usage changes.
   - `database-structure-constraints-indexes-and-triggers.md` for new indexes/constraints.
   - `database-structure-rls-and-access-control.md` and `database-structure-rls-policies-and-ddl.sql.md` for RLS changes.
   - `database-structure-migrations-ops-and-testing.md` for refresh jobs, tests, and operational checklists.
3. Ensure all tests for:
   - budget_actuals invariants,
   - currency enforcement,
   - and RLS membership behavior remain green.


---

<!-- source: steering/database/database-structure-categories-and-resolution.md -->

# Database Structure — Categories, Overrides, and Resolution

This file covers:

- System and profile category trees (`categories`)
- Per-profile overrides (`profile_category_overrides`)
- Workspace and view-level category trees/overrides (how they interact with resolution)
- Canonical category resolution order
- Implementation helpers:
  - effective_transaction_category(...)
  - effective_workspace_category(...)

Use this whenever you are working on anything that affects transaction categorization, category trees, or remapping rules.

For workspace/view table wiring and collaboration semantics more broadly, also load:
- database-structure-workspaces-and-views.md

---

## 1. Categories (System + Profile)

Table: categories

Purpose:
- Holds both system-wide and profile-specific category trees.
- System categories are shared defaults; profile categories are private to each profile.

Core columns:

- id — UUID PK.
- profile_id — UUID FK to profiles(id), nullable.
  - NULL: system default categories (shared tree).
  - Non-NULL: user-specific categories.
- parent_id — UUID NULL REFERENCES categories(id) DEFERRABLE INITIALLY DEFERRED.
  - Defines a tree structure.
  - Parent and child must share the same profile scope (both NULL for system categories, or both owned by the same profile).
- slug — TEXT.
  - Stable identifier used for uniqueness and mapping.
- name — TEXT.
  - Display name.
- sort — INT.
  - Optional sort order.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.
- deleted_at — TIMESTAMPTZ NULL.
  - Soft-delete marker.

Key constraints and indexes:

- Scoped slug uniqueness:

    UNIQUE (COALESCE(profile_id, '00000000-0000-0000-0000-000000000000'), slug)
    WHERE deleted_at IS NULL

  - Uses ZERO_UUID sentinel for system categories (profile_id NULL).
  - Prevents clashes between system and profile categories with same slug.

- Indexes:
  - Index on parent_id for tree traversal.
  - Additional indexes on (profile_id, deleted_at) or similar where needed by hot paths.

Semantics:

- System categories:
  - Rows with profile_id IS NULL.
  - Represent the canonical, seeded category tree (e.g. default spending categories).
  - Shared across all profiles and workspaces.
- Profile categories:
  - Rows with profile_id NOT NULL.
  - Private to that profile; do not leak across users.
- Seed data:
  - Must include a canonical “uncategorized” system category.
  - Ingestion maps missing provider categories to this system slug instead of leaving system_category_id NULL.

Soft deletion:

- deleted_at NOT NULL marks rows as archived.
- RLS and default queries hide soft-deleted categories.
- Historical/admin exports that need archived categories must opt in explicitly (dedicated roles or flags).

Parent scope constraint:

- A constraint trigger enforces that:

  - If parent_id IS NOT NULL:
    - parent.profile_id must equal child.profile_id
    - or both must be NULL (system tree).

- This ensures:
  - System roots only parent other system nodes.
  - Profile-owned categories cannot mix scope with system or other profiles.

Trigger (conceptual):

- ensure_category_parent_scope() trigger:
  - On INSERT/UPDATE:
    - If NEW.parent_id IS NULL: allow.
    - Else:
      - Fetch parent_profile from categories(parent_id).
      - Raise if parent_profile differs from NEW.profile_id (treat NULL/NULL as equal for system).

---

## 2. Profile Category Overrides

Table: profile_category_overrides

Purpose:
- Let a profile remap an existing category (system or profile) to another category in its own scope.

Core columns:

- id — UUID PK.
- profile_id — FK to profiles(id) NOT NULL.
- source_category_id — FK to categories(id) NOT NULL.
  - The category being overridden for this profile.
- target_category_id — FK to categories(id) NULL.
  - The category that replaces source_category_id for this profile.
  - Can reference:
    - System categories (profile_id NULL).
    - Profile-owned categories (profile_id = this profile).
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.
- deleted_at — TIMESTAMPTZ NULL.

Uniqueness:

- UNIQUE(profile_id, source_category_id) WHERE deleted_at IS NULL

Semantics:

- There is at most one active override per (profile, source_category_id).
- Target category cannot be forced to a workspace scope here; these are strictly profile-level remaps.
- When applied at the end of resolution:
  - current_category is replaced by target_category_id.
  - current_workspace_category is cleared (NULL) to indicate the final category is profile-specific.

Resolution role:

- profile_category_overrides are the last step in the canonical precedence chain.
- They apply after workspace/view overrides and are specific to a given profile.

---

## 3. Workspace and View Category Structures (Resolution-Specific View)

Full workspace/view table specs live in database-structure-workspaces-and-views.md. This section focuses only on the aspects relevant to category resolution.

### 3.1 workspace_categories

Purpose:
- Shared category tree at workspace level.
- Represents collaborative categories that all workspace members see.

Key resolution-related columns:

- id — UUID PK.
- workspace_id — FK to workspaces(id) NOT NULL.
- parent_id — UUID NULL REFERENCES workspace_categories(id) DEFERRABLE INITIALLY DEFERRED.
- slug — TEXT.
- name — TEXT.
- color — TEXT NULL (optional display).

Uniqueness:

- UNIQUE(workspace_id, slug) WHERE deleted_at IS NULL

Parent scope:

- Constraint trigger (ensure_workspace_category_parent_scope):
  - Ensures parent.workspace_id = child.workspace_id.

---

### 3.2 workspace_category_overrides

Purpose:
- Workspace-level remaps that adjust how categories appear within a workspace, without changing system/profile trees.

Key resolution-related columns:

- id — UUID PK.
- workspace_id — FK to workspaces(id) NOT NULL.
- source_category_id — FK workspace_categories(id) NULL.
- target_category_id — FK workspace_categories(id) NULL.
- system_source_category_id — FK categories(id) NULL.
- system_target_category_id — FK categories(id) NULL.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.
- deleted_at — TIMESTAMPTZ NULL.

Uniqueness:

- UNIQUE(workspace_id, COALESCE(source_category_id, system_source_category_id))
  WHERE deleted_at IS NULL

Source/target exclusivity:

- CHECK constraint enforces:
  - Exactly one of (source_category_id, system_source_category_id) is non-null.
  - Exactly one of (target_category_id, system_target_category_id) is non-null.

Semantics:

- Two types of overrides:

  1) System-source override:
     - system_source_category_id is set.
     - Optionally remaps to:
       - system_target_category_id (new system mapping), or
       - target_category_id (workspace category target).

  2) Workspace-source override:
     - source_category_id (workspace category) is set.
     - Remaps to:
       - system_target_category_id (rare),
       - or target_category_id (workspace category).

- In practice:
  - Most workspace overrides will map either:
    - system category → workspace category, or
    - workspace category → workspace category.

Resolution role (workspace-level):

- They apply after view overrides (for workspace-aware projections) and before profile overrides.
- For workspace-aware views (e.g., budgeting aggregates):
  - workspace_category_overrides determine the final workspace_category_id.

---

### 3.3 view_category_overrides

Purpose:
- Per-view remaps layered on top of system/workspace categories.
- Used to customize category presentation for a specific saved view.

Key resolution-related columns:

- id — UUID PK.
- view_id — FK saved_views(id) NOT NULL.
- source_category_id — FK workspace_categories(id) NULL.
- target_category_id — FK workspace_categories(id) NULL.
- system_source_category_id — FK categories(id) NULL.
- system_target_category_id — FK categories(id) NULL.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.
- deleted_at — TIMESTAMPTZ NULL.

Uniqueness:

- UNIQUE(view_id, COALESCE(source_category_id, system_source_category_id))
  WHERE deleted_at IS NULL

Source/target exclusivity:

- CHECK constraint mirrors workspace_category_overrides:
  - Exactly one of (source_category_id, system_source_category_id) is non-null.
  - Exactly one of (target_category_id, system_target_category_id) is non-null.

Semantics:

- View overrides can:
  - Remap a system category to another system category or a workspace category.
  - Remap a workspace category to another workspace category.
- They are layered per saved view and are only applied when:
  - The caller provides a view_id, and
  - The requester is a member of the view’s workspace.

Resolution role:

- View overrides are applied early for profile-aware resolution (after overlays).
- For workspace-wide projections, view overrides sit on top of system mapping, before workspace overrides.

---

## 4. Canonical Category Resolution Order

Effective category lookups must always use the same precedence rules, whether implemented via SQL functions or via explicit JOINs.

### 4.1 Precedence Chain

For a transaction’s effective category:

1) transaction_overlays.category_id  
   - Per-transaction exceptions (per-profile).
   - If present (and overlay not soft-deleted), this category replaces the base mapping.

2) view_category_overrides  
   - Per saved view, optional.
   - Applies only when:
     - A view_id is present, and
     - The caller is a member of the view’s workspace.
   - Can remap either:
     - System category, or
     - Current workspace category.

3) workspace_category_overrides  
   - Workspace-level remaps.
   - Applies when a workspace_id is present.
   - Similar source/target semantics as view overrides but scoped to workspace.

4) profile_category_overrides  
   - Profile-level remaps.
   - Final user-specific remap step.
   - Clearing current_workspace_category indicates a profile-specific category.

5) transactions.system_category_id  
   - Baseline mapping.
   - Set by ingestion from provider data + system rules.
   - If a transaction reaches the resolver with system_category_id IS NULL:
     - Functions return (NULL, NULL, 'system_mapping').
     - This is treated as data hygiene debt; ingestion/backfills must fix it.
     - Overrides do not attempt to match NULL.

Important notes:

- Workspace-scoped source_category_id rules only fire after a prior override has produced a non-null current_workspace_category.
- Profile overrides intentionally clear current_workspace_category so downstream callers know the final category is profile-specific.
- Category trees are limited to exactly two sources:
  - System/profile categories in categories.
  - Workspace categories in workspace_categories.
- Building a third category tree elsewhere is forbidden; derived views must reference one of these canonical tables.

---

## 5. Implementation Helpers

Two helper functions encapsulate the resolution logic:

- effective_transaction_category(...)
- effective_workspace_category(...)

These are defined in SQL (plpgsql) and can be used directly by queries or treated as reference behavior for JOIN-based plans.

### 5.1 effective_transaction_category

Signature (conceptual):

- effective_transaction_category(
    p_transaction_id uuid,
    p_profile_id uuid,
    p_workspace_id uuid DEFAULT NULL,
    p_view_id uuid DEFAULT NULL
  )
- Returns TABLE (
    category_id uuid,
    workspace_category_id uuid,
    source text
  )

Behavior:

- Inputs:
  - p_transaction_id — transaction to resolve.
  - p_profile_id — profile for which to resolve.
  - p_workspace_id — optional workspace context.
  - p_view_id — optional view context.

- Output:
  - category_id — final category UUID (system/profile).
  - workspace_category_id — effective workspace category UUID, if any.
  - source — text label describing the last influencing layer:
    - 'overlay'
    - 'view_override'
    - 'workspace_override'
    - 'profile_override'
    - 'system_mapping'

High-level algorithm:

1) Overlay layer:

   - Look up overlay_category from transaction_overlays where:
     - transaction_id = p_transaction_id
     - profile_id = p_profile_id
     - deleted_at IS NULL
   - If found:
     - current_category := overlay_category
     - current_workspace_category := NULL
     - last_source := 'overlay'
   - Else:
     - Select system_category_id from transactions where id = p_transaction_id
     - current_category := system_category_id
     - current_workspace_category := NULL
     - last_source := 'system_mapping'

2) View overrides (when p_view_id IS NOT NULL and current_category IS NOT NULL):

   - Join view_category_overrides vco and saved_views sv:
     - vco.view_id = p_view_id
     - vco.deleted_at IS NULL
     - sv.id = vco.view_id
     - Ensure requester is a member of sv.workspace via workspace_members.
   - Match either:
     - vco.system_source_category_id = current_category, or
     - vco.source_category_id = current_workspace_category
   - If a matching row is found:
     - If vco.system_target_category_id IS NOT NULL:
       - current_category := vco.system_target_category_id
     - Else:
       - current_category stays the same.
     - current_workspace_category := vco.target_category_id
     - last_source := 'view_override'

3) Workspace overrides (when p_workspace_id IS NOT NULL and current_category IS NOT NULL):

   - Query workspace_category_overrides wco:
     - wco.workspace_id = p_workspace_id
     - wco.deleted_at IS NULL
   - Match either:
     - wco.system_source_category_id = current_category, or
     - wco.source_category_id = current_workspace_category
   - If a matching row is found:
     - If wco.system_target_category_id IS NOT NULL:
       - current_category := wco.system_target_category_id
     - Else:
       - current_category stays the same.
     - current_workspace_category := wco.target_category_id
     - last_source := 'workspace_override'

4) Profile overrides (when current_category IS NOT NULL):

   - Query profile_category_overrides pco:
     - pco.profile_id = p_profile_id
     - pco.deleted_at IS NULL
     - pco.source_category_id = current_category
   - If found:
     - current_category := pco.target_category_id
     - current_workspace_category := NULL
     - last_source := 'profile_override'

5) Return:

   - Return current_category, current_workspace_category, last_source.

Usage:

- Profile-aware queries should:

    SELECT t.*, ec.category_id, ec.workspace_category_id, ec.source
    FROM transactions t
    CROSS JOIN LATERAL effective_transaction_category(
      t.id,
      current_setting('app.profile_id', true)::uuid,
      current_setting('app.workspace_id', true)::uuid,
      :view_id
    ) ec
    ...

- This ensures the UI and API share consistent effective category behavior.

---

### 5.2 effective_workspace_category

Signature (conceptual):

- effective_workspace_category(
    p_transaction_id uuid,
    p_workspace_id uuid,
    p_view_id uuid DEFAULT NULL
  )
- Returns TABLE (
    category_id uuid,
    workspace_category_id uuid,
    source text
  )

Behavior:

- Inputs:
  - p_transaction_id — transaction id.
  - p_workspace_id — workspace context.
  - p_view_id — optional view id.

- Output:
  - category_id — final system category id (after any remaps).
  - workspace_category_id — final workspace category id, if any.
  - source — text label describing the last influencing layer:
    - 'system_mapping'
    - 'view_override'
    - 'workspace_override'

High-level algorithm:

1) Start from system mapping:

   - Select system_category_id from transactions where id = p_transaction_id.
   - current_category := system_category_id.
   - current_workspace_category := NULL.
   - last_source := 'system_mapping'.

2) View overrides (if p_view_id IS NOT NULL):

   - Join saved_views sv and view_category_overrides vco:
     - sv.id = p_view_id
     - sv.workspace_id = p_workspace_id
     - vco.view_id = sv.id
     - vco.deleted_at IS NULL
   - Match either:
     - vco.system_source_category_id = current_category, or
     - vco.source_category_id = current_workspace_category
   - If found:
     - If vco.system_target_category_id IS NOT NULL:
       - current_category := vco.system_target_category_id
     - Else:
       - current_category stays the same.
     - current_workspace_category := vco.target_category_id
     - last_source := 'view_override'.

3) Workspace overrides:

   - Query workspace_category_overrides wco:
     - wco.workspace_id = p_workspace_id
     - wco.deleted_at IS NULL
   - Match either:
     - wco.system_source_category_id = current_category, or
     - wco.source_category_id = current_workspace_category
   - If found:
     - If wco.system_target_category_id IS NOT NULL:
       - current_category := wco.system_target_category_id
     - Else:
       - current_category stays the same.
     - current_workspace_category := wco.target_category_id
     - last_source := 'workspace_override'.

4) Return:

   - Return current_category, current_workspace_category, last_source.

Usage:

- Workspace-wide aggregates, such as budget_actuals, should:

    SELECT t.*, ew.category_id, ew.workspace_category_id, ew.source
    FROM transactions t
    CROSS JOIN LATERAL effective_workspace_category(
      t.id,
      :workspace_id,
      :view_id
    ) ew
    ...

- This keeps materialized aggregates (like budget_actuals) profile-agnostic and aligned with workspace/view remaps.

---

## 6. Performance and Testing Guidance

To keep category resolution correct and efficient:

- High-volume analytics (budget refreshes, exports):
  - Prefer direct JOINs against override tables (view/workspace/profile) using the canonical precedence logic rather than calling the UDF for each row.
  - Use the same precedence order:
    - overlay → view → workspace → profile → system.
  - Keep covering indexes on overrides for fast lookups:
    - view_category_overrides:
      - (view_id, system_source_category_id, deleted_at)
      - (view_id, source_category_id, deleted_at)
    - workspace_category_overrides:
      - (workspace_id, system_source_category_id, deleted_at)
      - (workspace_id, source_category_id, deleted_at)
    - profile_category_overrides:
      - (profile_id, source_category_id, deleted_at)

- Tests:
  - A pgTAP test suite (e.g. tooling/tests/pgtap/effective_category.sql) should:
    - Generate randomized combinations of:
      - system categories,
      - workspace categories,
      - overlays,
      - profile overrides,
      - workspace overrides,
      - view overrides.
    - Compare:
      - effective_transaction_category / effective_workspace_category outputs, vs.
      - An equivalent SQL JOIN implementation using the documented precedence.
    - Assert that all combinations match, preventing precedence regressions.

- Invariance:
  - Every resolver (SQL helper, SDK, analytics export) must honor the same precedence order so:
    - The UI.
    - Direct API consumers.
    - Analytical exports.
    - All see the same effective categories for the same transaction and context.

If you are modifying category trees, overrides, or resolution helpers, update:

- This file (for semantics).
- database-structure-constraints-indexes-and-triggers.md (for indexes/constraints).
- database-structure-budgets.md (if budget_actuals uses category behavior you changed).
- database-structure-migrations-ops-and-testing.md (for tests and validation).


---

<!-- source: steering/database/database-structure-connections-and-ledger.md -->

# Database Structure — Connections, Bank Accounts, Transactions (Ledger)

This file covers the core financial ledger:

- External connections (`connections`)
- Connection sponsorship history (`connection_sponsor_history`)
- Bank accounts (`bank_accounts`)
- Immutable base transactions (`transactions`)
- Per-profile transaction overlays (`transaction_overlays`)
- Transaction audit log (`transaction_audit_log`)
- Append-only guarantees and soft-delete behavior

Use this whenever you’re touching ingestion, sync, or anything that reads/writes financial data.

For:

- Workspace access graph → see `database-structure-workspaces-and-views.md`  
- Category resolution → see `database-structure-categories-and-resolution.md`  
- RLS and triggers → see `database-structure-rls-and-access-control.md` and `database-structure-constraints-indexes-and-triggers.md`  

---

## 1. Connections

Table: `connections`

Purpose:

- Represents an external data source (e.g. a Plaid item).
- Owns the bank accounts and transactions imported from that provider.

Core columns:

- `id` — UUID PK.
- `owner_profile_id` — UUID FK to `profiles(id)` NOT NULL.
  - The profile that owns this connection and retains authority over its data.
- `provider` — TEXT NOT NULL.
  - e.g. `'plaid'`, `'sandbox'`.
- `provider_item_id` — TEXT NOT NULL.
  - Provider-specific identifier for the “item”.
  - For Plaid, this is the `item_id` when `provider = 'plaid'`.
- `status` — TEXT with CHECK:
  - `CHECK (status IN ('active','paused','error','deleted'))`
  - `'deleted'` is a soft-delete state, not a hard delete.
- `tx_cursor` — TEXT NULL:
  - Provider sync cursor for incremental transaction fetches.
- `config` — JSONB:
  - Non-secret provider metadata (e.g. institution display names, environment flags).
  - Sensitive secrets (access tokens, webhooks) live in encrypted columns or a separate `connection_secrets`-style table, not here.
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.
- `deleted_at` — TIMESTAMPTZ NULL:
  - Soft-delete marker for the connection as a whole.

Constraints and indexes:

- `UNIQUE (provider, provider_item_id)`
  - Ensures a provider item is not duplicated.
- Indexes typically include:
  - `(owner_profile_id, status)` for ownership listings.
  - `(provider, provider_item_id)` via the unique index.

Ownership rule:

- `owner_profile_id` always retains read/write authority over all accounts and transactions under this connection.
- Even if all workspace links are revoked, the owner still sees the data.
- RLS policies are written with this assumption; do **not** attempt to hide owner data via workspace-level revocations.

Soft delete:

- `deleted_at` set (and/or `status = 'deleted'` or `'error'`):
  - RLS hides the connection and its accounts/transactions from normal user traffic.
  - Rows remain stored for maintenance, audit, and incident response under maintenance roles.

---

## 2. Connection Sponsor History

Table: `connection_sponsor_history`

Purpose:

- Append-only log tracking sponsorship/ownership transitions of a connection.
- Useful for auditing and for understanding who granted workspace access when ownership changes.

Core columns:

- `id` — UUID PK.
- `connection_id` — FK to `connections(id)` NOT NULL.
- `from_profile_id` — FK to `profiles(id)` NULL:
  - Previous sponsor; NULL for initial creation.
- `to_profile_id` — FK to `profiles(id)` NOT NULL:
  - New sponsor/owner profile.
- `changed_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.

Semantics:

- Insert an initial row on connection creation:
  - `from_profile_id` = NULL, `to_profile_id` = owner_profile_id.
- Insert a new row for each transfer of sponsorship.
- `connections.owner_profile_id` remains the source of truth for current ownership; this table is the history.

Indexes:

- Recommended index on `(connection_id, changed_at DESC)`:
  - Supports efficient “latest sponsor” queries.

---

## 3. Bank Accounts

Table: `bank_accounts`

Purpose:

- Represents individual accounts (checking, savings, credit cards, etc.) under a connection.

Core columns:

- `id` — UUID PK.
- `connection_id` — FK to `connections(id)` NOT NULL.
- `external_account_id` — TEXT NOT NULL:
  - Provider-specific account identifier (e.g. Plaid account_id).
- `institution` — TEXT:
  - Institution name/identifier (e.g. “Chase”).
- `subtype` — TEXT:
  - Account subtype (e.g. “checking”, “savings”, “credit”, “loan”).
- `mask` — TEXT:
  - Obfuscated last digits (e.g. “1234”).
- `name` — TEXT:
  - User-facing account name (e.g. “Everyday Checking”).
- `balance_cents` — BIGINT:
  - Latest known balance in cents.
- `currency` — `VARCHAR(3) CHECK (char_length(currency) = 3)`:
  - ISO currency code for the account.
- `hidden` — BOOL NOT NULL DEFAULT `false`:
  - If true, UI should not show this account by default (but RLS still governs access).
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.
- `deleted_at` — TIMESTAMPTZ NULL:
  - Soft-delete marker; archived accounts disappear from normal queries.

Constraints:

- `UNIQUE (connection_id, external_account_id) WHERE deleted_at IS NULL`
  - Ensures no duplicate live accounts per connection.
- `UNIQUE (id, connection_id)`
  - Backing composite FK usage against (account_id, connection_id).

Indexes:

- Typical index: `(connection_id, deleted_at, id)` to support RLS and active-account queries.

Soft delete:

- When `deleted_at` is set:
  - RLS hides the account from user-facing traffic.
  - Its transactions remain stored but are not visible except under maintenance roles.

---

## 4. Transactions (Append-Only Ledger)

Table: `transactions`

Purpose:

- Immutable base ledger rows for financial activity.
- Every financial operation is represented as an append-only row.

Core columns:

- `id` — UUID PK.
- `account_id` — FK to `bank_accounts(id)` NOT NULL.
- `connection_id` — FK to `connections(id)` NOT NULL.
- `provider_tx_id` — TEXT NOT NULL:
  - Provider transaction identifier.
  - When provider omits IDs, a deterministic fallback is derived (see below).
- `posted_at` — TIMESTAMPTZ NOT NULL:
  - Posting timestamp (settled date/time).
- `authorized_at` — TIMESTAMPTZ NULL:
  - Authorization timestamp (if distinct from posted_at).
- `amount_cents` — BIGINT NOT NULL:
  - Transaction amount in cents, following global sign convention:
    - Positive: inflows/credits (deposits, refunds, income).
    - Negative: outflows/debits (purchases, payments, fees).
    - Zero is reserved for explicit adjustments tracked via overlays; base transactions never store 0-cent rows.
- `currency` — `VARCHAR(3) CHECK (char_length(currency) = 3)` NOT NULL.
- `system_category_id` — UUID NULL REFERENCES `categories(id)`:
  - Baseline system category (system or profile category).
  - Must be populated for all new rows (see below).
- `merchant_raw` — TEXT:
  - Raw merchant string from provider.
- `raw_payload` — JSONB:
  - Raw provider payload for auditing/debugging.
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.

Foreign keys and uniqueness:

- Composite FK:

  - `(account_id, connection_id)` REFERENCES `bank_accounts(id, connection_id)`

- Deterministic uniqueness:

  - `UNIQUE (connection_id, provider_tx_id)`

Fallback provider_tx_id:

- When providers omit transaction IDs:
  - `provider_tx_id` is derived via:

    - `sha256(connection_id || posted_at || amount_cents || merchant_raw)`

  - This ensures deterministic uniqueness per connection.

Category baseline:

- `system_category_id`:
  - Defaults to the seeded system “uncategorized” category.
  - Ingestion **must** set this column on every new row.
  - Runtime writes that attempt to persist NULL must be rejected before hitting the database.
- Schema initially allows NULL solely to accommodate legacy data:
  - Once backfill completes, the column will be migrated to NOT NULL.

Indexes:

- Hot-path indexes:
  - `(account_id, posted_at DESC)` — account feed queries.
  - `(posted_at DESC)` — global time-based queries.
  - GIN index on `raw_payload` for JSON search.

Append-only enforcement:

- `transactions` is strictly append-only:
  - No UPDATE or DELETE allowed via app role.
- Enforcement via:
  - Triggers (e.g. `transactions_no_update`, `transactions_no_delete`) that call a function like `prevent_transaction_mutation()` which raises `transactions are append-only`.
  - `app_user` role does not have UPDATE/DELETE privileges on this table.
- Edits to categories, notes, and splits must go through `transaction_overlays` or new append events, never by mutating base rows.

Soft-delete behavior:

- When a `connections` or `bank_accounts` row is soft-deleted:
  - RLS hides associated `transactions` from user queries.
  - Rows remain physically present for audit/forensic tooling under maintenance roles.

---

## 5. Transaction Overlays

Table: `transaction_overlays`

Purpose:

- Per-profile exceptions and annotations on base transactions:
  - Category overrides.
  - Notes and tags.
  - Split information.
  - Merchant corrections.
  - Exclusion flags.

Core columns:

- `id` — UUID PK.
- `transaction_id` — FK to `transactions(id)` NOT NULL.
- `profile_id` — FK to `profiles(id)` NOT NULL.
- `category_id` — FK to `categories(id)` NULL:
  - Per-transaction override category for this profile.
  - May point to a system or profile-owned category.
- `notes` — TEXT.
- `tags` — `TEXT[]` NOT NULL DEFAULT `'{}'`:
  - Free-form labels for filtering/search.
- `splits` — JSONB NOT NULL DEFAULT `'[]'`:
  - JSON array representing split allocations.
- `merchant_correction` — TEXT NULL:
  - User-specified override for merchant display name.
- `exclude` — BOOL NOT NULL DEFAULT `false`:
  - When true, transaction should be excluded from certain reports/budgets for this profile.
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.
- `deleted_at` — TIMESTAMPTZ NULL:
  - Soft-delete marker for overlays.

Uniqueness:

- `UNIQUE (profile_id, transaction_id)`
  - At most one active overlay per profile/transaction pair.

Indexes:

- GIN index on `tags` for tag-based search.
- Optional GIN index on `splits` for JSON-based queries.
- Partial indexes for hot lookups:

  - `(profile_id) WHERE deleted_at IS NULL`
  - `(transaction_id) WHERE deleted_at IS NULL`

Splits validation:

- BEFORE trigger `validate_transaction_overlay_splits` ensures:

  - `splits` is either NULL or a JSON array.
  - Each element is an object with `amount_cents`.
  - The sum of all `amount_cents` across splits equals the base transaction `amount_cents`:

    - Retrieve base_amount from `transactions.amount_cents`.
    - If sum != base_amount, raise an exception.

- This guarantees splits are consistent with the underlying transaction amount.

Category semantics:

- `category_id`:
  - Always references `categories.id` (system or profile).
  - Does **not** reference `workspace_categories`; workspace-specific labeling uses overrides (see workspace/category docs).
- Overlays represent **per-transaction** exceptions:
  - Category resolver treats them as the highest precedence when present (per profile).
  - They override the category only for that specific transaction and profile.

RLS semantics:

- A profile can only see or mutate overlays for its own `profile_id`.
- Access also requires that the profile has visibility on the underlying transaction via the access graph.
- RLS policies link overlays to transactions, connections, bank_accounts, and workspace scopes.

---

## 6. Transaction Audit Log

Table: `transaction_audit_log`

Purpose:

- Append-only log for transaction-related events.
- Tracks ingest/sync events and manual operations touching transaction state.

Core columns:

- `id` — UUID PK.
- `transaction_id` — FK to `transactions(id)` NOT NULL.
- `sync_session_id` — FK to `sync_sessions(id)` NULL:
  - Optional reference to the sync session that triggered the event.
- `event` — TEXT NOT NULL:
  - Event type (e.g. `"ingested"`, `"updated_category_from_provider"`, `"backfill_adjustment"`).
- `details` — JSONB:
  - Structured metadata about the event (diffs, provider status, etc.).
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.

Semantics:

- Append-only:
  - New row per event; no UPDATE/DELETE for app_user.
- Tied into sync:
  - Many events originate from `sync_sessions` and ingestion.
- RLS behavior:
  - Access is limited to profiles that can see the underlying transaction based on connections, workspaces, and allowed accounts.

---

## 7. Sync Integration (High-Level)

Full sync schema is in `database-structure-sync-and-caches.md`, but key interactions with the ledger:

- `sync_sessions` run **per connection**:
  - Pull pages of provider data.
  - Write `transactions` (append-only).
  - Update `tx_cursor` on `connections`.
- When new transactions are inserted:
  - They automatically surface to workspaces with active:
    - `workspace_connection_links` or
    - `workspace_allowed_accounts`
  - covering the relevant accounts.
- Recovering stuck sessions:
  - If a sync session lease expires without completion:
    - Mark the session status `'error'` (or schedule retry).
    - Start a new `sync_session` with a fresh lease.
  - Workers must release leases on success/failure and update `sync_sessions.status` accordingly.

---

## 8. Append-Only and Soft-Delete Invariants

Global invariants around the ledger:

- Base transactions are append-only:
  - Edits to categories, splits, or merchant names must go through overlays or new append entries.
  - Application attempts to UPDATE or DELETE as app_user must result in:
    - DB error `transactions are append-only`, and
    - A structured 409-style error surfaced by the API.

- Soft delete first:
  - Parents (profiles, workspaces, connections, bank_accounts, categories, workspace_categories) use `ON DELETE RESTRICT`.
  - Application workflows toggle `deleted_at` instead of hard deleting parents.
  - Children (e.g. transactions) remain intact.

- Ledger-related foreign keys:
  - `transaction_overlays.transaction_id`, `transaction_overlays.profile_id`, and `transaction_audit_log.transaction_id`:
    - Must use `ON DELETE RESTRICT` because transactions never hard-delete.

- RLS alignment:
  - RLS rules ensure that:
    - Soft-deleted connections and accounts hide their transactions/overlays from normal traffic.
    - Maintenance roles can still access them when necessary.

For the raw SQL definitions of triggers (`prevent_transaction_mutation`, `validate_transaction_overlay_splits`), indexes, and policies, see:

- `database-structure-constraints-indexes-and-triggers.md`
- `database-structure-rls-policies-and-ddl.sql.md`


---

<!-- source: steering/database/database-structure-constraints-indexes-and-triggers.md -->

# Database Structure — Constraints, Indexes, and Triggers

This file collects the “hard edges” of the schema:

- Deterministic uniqueness constraints
- Not-null + soft-delete guarantees
- Foreign key delete semantics
- Index strategy (B-tree, BRIN, GIN, partials)
- Reference SQL for indexes/checks
- Key constraint/validation functions and triggers
- `workspace_allowed_accounts` DDL + helper function

Use this when:

- Adding/modifying tables or FKs
- Introducing new unique constraints or partial indexes
- Touching append-only guarantees or split validation
- Working on workspace/account scoping helpers

For:

- Table-level semantics → see the per-area files:
  - `database-structure-auth-and-profiles.md`
  - `database-structure-categories-and-resolution.md`
  - `database-structure-workspaces-and-views.md`
  - `database-structure-budgets.md`
  - `database-structure-connections-and-ledger.md`
  - `database-structure-sync-and-caches.md`
- RLS policies and role setup → see:
  - `database-structure-rls-and-access-control.md`
  - `database-structure-rls-policies-and-ddl.sql.md`
- Ops/test harnesses → see:
  - `database-structure-migrations-ops-and-testing.md`

---

## 1. Deterministic Constraints and Uniqueness

We rely on explicit uniqueness and check constraints to keep the domain deterministic and RLS-safe.

### 1.1 Canonical unique constraints (conceptual list)

These are the “must-have” uniqueness rules across the schema:

- Connections:
  - `UNIQUE connections(provider, provider_item_id)`
- Bank accounts:
  - `UNIQUE bank_accounts(connection_id, external_account_id) WHERE deleted_at IS NULL`
  - `UNIQUE bank_accounts(id, connection_id)` (composite FK support)
- Transactions:
  - `UNIQUE transactions(connection_id, provider_tx_id)`
- Transaction overlays:
  - `UNIQUE transaction_overlays(profile_id, transaction_id)`
- Workspace members:
  - `UNIQUE workspace_members(workspace_id, member_profile_id)`
- Categories:
  - `UNIQUE categories(
       COALESCE(profile_id, '00000000-0000-0000-0000-000000000000'::uuid),
       slug
     ) WHERE deleted_at IS NULL`
- Profile category overrides:
  - `UNIQUE profile_category_overrides(profile_id, source_category_id) WHERE deleted_at IS NULL`
- Budget versions:
  - `UNIQUE budget_versions(plan_id, version_no)`
- View links:
  - `UNIQUE view_links.token_hash`
- Workspace connection links:
  - `UNIQUE workspace_connection_links(workspace_id, connection_id) WHERE revoked_at IS NULL`
- Workspace allowed accounts:
  - `UNIQUE workspace_allowed_accounts(workspace_id, bank_account_id) WHERE revoked_at IS NULL`
- Workspace categories:
  - `UNIQUE workspace_categories(workspace_id, slug) WHERE deleted_at IS NULL`
- Workspace category overrides:
  - `UNIQUE workspace_category_overrides(
       workspace_id,
       COALESCE(source_category_id, system_source_category_id)
     ) WHERE deleted_at IS NULL`
- View category overrides:
  - `UNIQUE view_category_overrides(
       view_id,
       COALESCE(source_category_id, system_source_category_id)
     ) WHERE deleted_at IS NULL`
- Users:
  - `UNIQUE users.email_lower` (case-insensitive email contract)
- API keys:
  - `UNIQUE api_keys.key_hash`
- Sessions + verification tokens:
  - `UNIQUE sessions.session_token_hash`
  - `UNIQUE verification_tokens.token_hash`

### 1.2 Alignment with soft-delete and RLS predicates

A critical invariant:

- Every partial UNIQUE index representing “active” rows must use the same predicate as:
  - The table’s soft-delete condition (`deleted_at IS NULL`, `revoked_at IS NULL`, etc.), and
  - Any RLS filters that aim to hide archived rows.

In other words:

- If a constraint is meant to apply only to active rows:
  - It **must** be defined as a partial index using the same predicate the RLS policy uses to hide inactive rows.
- Adding a new uniqueness constraint without mirroring the soft-delete predicate is forbidden because:
  - It would cause archived rows to participate in conflict checks and leak into logical behavior.

---

## 2. Not-Null Guarantees and Soft-Delete Hygiene

We enforce a strict not-null discipline for core columns:

### 2.1 Not-null rules

- Every foreign key (`*_id`) must be `NOT NULL` unless explicitly documented as optional.
- Every hash/status column must be `NOT NULL` unless there is a very clear reason to allow NULL.
  - Examples:
    - `key_hash`, `token_hash`, `session_token_hash`.
    - `status` columns like on `connections`, `sync_sessions`.
- Every timestamp (`created_at`, `updated_at`) must be `NOT NULL`:
  - Append-only tables (e.g. `transactions`, `transaction_audit_log`) may omit `updated_at` but must keep:
    - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.

### 2.2 Soft-delete fields

- Soft-delete columns:
  - `deleted_at`, `revoked_at` (and related TTL fields) default to `NULL`.
- RLS and indexes:
  - Active-only partial indexes use:
    - `WHERE deleted_at IS NULL`, `WHERE revoked_at IS NULL`, etc.
  - RLS predicates must also reference these same columns so inactive rows:
    - Stay out of hot paths.
    - Do not appear in normal user queries.

### 2.3 CI checks for nullability and partial indexes

We expect CI to guard these invariants via scripts:

- `tooling/scripts/check-not-null.ts`:
  - Queries `information_schema.columns` for monitored tables.
  - Fails if any FK/timestamp/hash/status field becomes nullable.
- `tooling/scripts/check-partial-indexes.ts`:
  - Verifies that partial indexes guarding active rows:
    - Use the documented soft-delete predicates.
  - Fails if new partial indexes drift from the contract.

Any migration that loosens nullability or alters soft-delete predicates must:

- Update this document.
- Update the corresponding CI scripts and tests.

---

## 3. Foreign Key Delete Semantics

We distinguish between “soft-delete-first” parents and fan-out/child tables.

### 3.1 Soft-delete-first parents

Tables like:

- `profiles`
- `workspaces`
- `connections`
- `bank_accounts`
- `categories`
- `workspace_categories`

are “soft-delete-first” parents.

Rules:

- FKs from children to these parents use `ON DELETE RESTRICT`.
- Application workflows:
  - Set `deleted_at` instead of hard-deleting parent rows.
  - Keep child rows intact for historical/audit purposes.

### 3.2 Category trees and overrides

- FKs between category-related tables:

  - `categories.parent_id`
  - `profile_category_overrides.*`
  - `workspace_categories.parent_id`
  - `workspace_category_overrides.*`
  - `view_category_overrides.*`

- Use `ON DELETE RESTRICT`:
  - This preserves taxonomy history until soft-delete workflows clear dependent rows in a controlled order.

### 3.3 Budget hierarchy

- `budget_versions.plan_id` and `budget_envelopes.version_id` use `ON DELETE RESTRICT`:
  - Plans and envelopes are archived via `deleted_at`.
  - No cascade deletes.

### 3.4 Append-only ledger

- Ledger-related FKs:

  - `transaction_overlays.transaction_id`
  - `transaction_overlays.profile_id`
  - `transaction_audit_log.transaction_id`

- Must use `ON DELETE RESTRICT` because:
  - `transactions` are append-only and never hard-deleted.
  - Overlays and audit rows remain valid history referencing immutable transactions.

### 3.5 Workspace collateral

- Tables like:

  - `workspace_members`
  - `workspace_connection_links`
  - `workspace_allowed_accounts`
  - `view_*`
  - `saved_views`

- Rely on `ON DELETE RESTRICT`:
  - Ensures soft-deletion semantics stay coherent.
  - Parents (workspaces, views) are archived via `deleted_at` instead of being physically removed.

### 3.6 Sync fan-out

For sync-related parent/child relationships:

- Child tables:

  - `session_page_payloads.sync_session_id`
  - `session_idempotency.sync_session_id`
  - `session_leases.sync_session_id`
  - `sync_audit_log.sync_session_id` (when present)

- Use `ON DELETE CASCADE`:
  - Deleting a `sync_session` cleans up its dependent rows.

- The parent FK `sync_sessions.connection_id` remains `ON DELETE RESTRICT`:
  - Connection is soft-deleted, not cascaded.

### 3.7 Cache tables

- Caches:

  - `user_connection_access_cache`
  - `profile_transaction_access_cache`

- Prefer `ON DELETE CASCADE` on FKs pointing back to profiles/workspaces/connections/transactions:
  - Deleting or purging the parent makes stale cache rows disappear automatically.

---

## 4. Index Strategy (Selected)

We rely on a mix of B-tree, BRIN, and GIN indexes to balance hot-path latency with write cost.

### 4.1 Time-sorted reads

Optimize time-sorted read patterns:

- `transactions (account_id, posted_at DESC)`:
  - Per-account transaction feeds.
- `sync_sessions (connection_id, started_at DESC)`:
  - “Last sync” per connection and sync history.

### 4.2 JSONB GIN indexes

Use JSONB + GIN for structured configurations and filters:

- `workspace_members.scope_json`
- `workspace_connection_links.account_scope_json`
- `connections.config`
- `transactions.raw_payload`
- `transaction_overlays.tags` / `transaction_overlays.splits` (optional)
- Cache scopes, where relevant

Use `jsonb_path_ops` when predicates rely heavily on `@>` containment.

### 4.3 Active-only partial indexes

Soft-deleted or revoked rows should not bloat hot indexes:

- Use partial indexes with predicates:
  - `WHERE deleted_at IS NULL`
  - `WHERE revoked_at IS NULL`
- Typical examples:
  - Active workspace categories.
  - Active category overrides.
  - Active workspace_connection_links.
  - Active workspace_allowed_accounts.
  - Active transaction_overlays by profile/transaction.

### 4.4 Long-range scans

For large historical datasets:

- BRIN index on `transactions(posted_at)`:
  - Optimizes archive/reporting queries that scan long ranges of time.
  - Lower maintenance overhead than B-tree for large tables.

### 4.5 Overlay lookups

Overlay hot paths:

- Partial indexes:

  - `(profile_id) WHERE deleted_at IS NULL`
  - `(transaction_id) WHERE deleted_at IS NULL`

- Keep these minimal and aligned with RLS so overlay lookups remain fast.

### 4.6 Workspace scopes

Workspace access patterns need composite indexes:

- `workspace_members(workspace_id, member_profile_id, role)`
- `workspace_allowed_accounts(workspace_id, bank_account_id, revoked_at)`
- `workspace_connection_links(workspace_id, connection_id, revoked_at, expires_at)`

These support both:

- RLS predicates.
- Application queries for workspace-scoped access.

### 4.7 Workspace categories and overrides

Tree traversal and override lookups:

- `workspace_categories(workspace_id, parent_id)`
- `workspace_category_overrides(
     workspace_id,
     system_source_category_id,
     deleted_at
   )`
- `workspace_category_overrides(
     workspace_id,
     source_category_id,
     deleted_at
   )`

Category resolution functions and JOIN-based plans depend on these.

### 4.8 Search (optional)

Optional full-text-ish search:

- `pg_trgm` GIN index on `transactions.merchant_raw`:
  - For fuzzy merchant search and matching.

### 4.9 GIN/JSONB cost tuning

GIN indexes are expensive; we actively validate their value:

- Benchmark write loads on a Neon preview branch (e.g. `tooling/scripts/seed-demo.ts --writes=heavy`) and sample:
  - `pg_stat_wal` (WAL bytes/minute).
  - `pg_stat_statements` (query latency).
  - `pg_stat_all_indexes` (index usage).
- Focus on tables with stacked GIN indexes:
  - `workspace_members.scope_json`
  - `workspace_connection_links.account_scope_json`
  - `workspace_allowed_accounts.account_scope_json` (if any)
  - `connections.config`
  - `sync_sessions` payload-like fields
  - `transaction_overlays.tags` / `splits`
- WAL growth over baseline should stay within an agreed budget (e.g. +20%). If not:
  - Trim low-value indexes.
  - Narrow them with partial predicates on active rows only.
- Use targeted query plans (via `EXPLAIN (ANALYZE, BUFFERS)`) on production-like predicates to ensure:
  - Each GIN index actually improves latency or buffer usage.
- Capture results in a guard script such as `tooling/scripts/validate-gin-costs.ts` and gate merges with:
  - `pnpm db:gin-validate`

---

## 5. Drop-in SQL Indexes and Checks (Reference)

These examples are the raw SQL backing many of the declarative constraints described above. Treat them as reference when hand-writing migrations or verifying generated SQL.

Do not duplicate them if your ORM/migrations already produce equivalent definitions.

Example unique/partial indexes and checks:

    CREATE UNIQUE INDEX uq_ws_conn_active
      ON workspace_connection_links (workspace_id, connection_id)
      WHERE revoked_at IS NULL;

    CREATE UNIQUE INDEX uq_bank_accounts_id_conn
      ON bank_accounts (id, connection_id);

    CREATE UNIQUE INDEX uq_categories_scoped_slug
      ON categories (
        COALESCE(profile_id, '00000000-0000-0000-0000-000000000000'),
        slug
      )
      WHERE deleted_at IS NULL;

    CREATE UNIQUE INDEX uq_profile_category_overrides
      ON profile_category_overrides (profile_id, source_category_id)
      WHERE deleted_at IS NULL;

    CREATE INDEX ix_profile_category_overrides_source
      ON profile_category_overrides (profile_id, source_category_id, deleted_at);

    CREATE UNIQUE INDEX uq_users_email_lower
      ON users (email_lower);

    CREATE INDEX ix_sessions_expires
      ON sessions (expires);

    CREATE INDEX ix_verification_tokens_expires
      ON verification_tokens (expires);

    CREATE UNIQUE INDEX uq_workspace_categories_slug
      ON workspace_categories (workspace_id, slug)
      WHERE deleted_at IS NULL;

    CREATE UNIQUE INDEX uq_workspace_category_overrides
      ON workspace_category_overrides (
        workspace_id,
        COALESCE(source_category_id, system_source_category_id)
      )
      WHERE deleted_at IS NULL;

    CREATE INDEX ix_workspace_category_overrides_source
      ON workspace_category_overrides (workspace_id, system_source_category_id, deleted_at);

    CREATE INDEX ix_workspace_category_overrides_source_local
      ON workspace_category_overrides (workspace_id, source_category_id, deleted_at);

    CREATE UNIQUE INDEX uq_view_category_overrides
      ON view_category_overrides (
        view_id,
        COALESCE(source_category_id, system_source_category_id)
      )
      WHERE deleted_at IS NULL;

    CREATE INDEX ix_view_category_overrides_source
      ON view_category_overrides (view_id, system_source_category_id, deleted_at);

    CREATE INDEX ix_view_category_overrides_source_local
      ON view_category_overrides (view_id, source_category_id, deleted_at);

    ALTER TABLE api_keys
      ADD CONSTRAINT api_keys_owner_ck CHECK (profile_id IS NOT NULL);

    ALTER TABLE bank_accounts
      ADD CONSTRAINT bank_accounts_currency_ck CHECK (char_length(currency) = 3);

    ALTER TABLE transactions
      ADD CONSTRAINT transactions_currency_ck CHECK (char_length(currency) = 3);

    CREATE UNIQUE INDEX uq_tx_provider
      ON transactions (connection_id, provider_tx_id);

    CREATE INDEX ix_tx_account_posted
      ON transactions (account_id, posted_at DESC);

    CREATE INDEX brin_tx_posted
      ON transactions USING brin (posted_at);

    CREATE INDEX ix_tx_overlays_profile_active
      ON transaction_overlays (profile_id)
      WHERE deleted_at IS NULL;

    CREATE INDEX ix_tx_overlays_transaction_active
      ON transaction_overlays (transaction_id)
      WHERE deleted_at IS NULL;

    CREATE INDEX ix_workspace_members_by_role
      ON workspace_members (workspace_id, member_profile_id, role);

    CREATE INDEX ix_bank_accounts_conn_active
      ON bank_accounts (connection_id, deleted_at, id);

    CREATE INDEX ix_workspace_allowed_accounts_active
      ON workspace_allowed_accounts (workspace_id, bank_account_id, revoked_at);

    CREATE INDEX ix_workspace_connection_links_active
      ON workspace_connection_links (workspace_id, connection_id, revoked_at, expires_at);

    CREATE INDEX scope_json_path_ops
      ON workspace_members USING gin (scope_json jsonb_path_ops);

    ALTER TABLE workspace_category_overrides
      ADD CONSTRAINT workspace_category_overrides_source_target_ck CHECK (
        (
          (source_category_id IS NOT NULL AND system_source_category_id IS NULL)
          OR
          (source_category_id IS NULL AND system_source_category_id IS NOT NULL)
        )
        AND
        (
          (target_category_id IS NOT NULL AND system_target_category_id IS NULL)
          OR
          (target_category_id IS NULL AND system_target_category_id IS NOT NULL)
        )
      );

    ALTER TABLE view_category_overrides
      ADD CONSTRAINT view_category_overrides_source_target_ck CHECK (
        (
          (source_category_id IS NOT NULL AND system_source_category_id IS NULL)
          OR
          (source_category_id IS NULL AND system_source_category_id IS NOT NULL)
        )
        AND
        (
          (target_category_id IS NOT NULL AND system_target_category_id IS NULL)
          OR
          (target_category_id IS NULL AND system_target_category_id IS NOT NULL)
        )
      );

---

## 6. workspace_allowed_accounts DDL and Helper

The normalized account-scope table and its helper function live here as reference.

### 6.1 Table definition

    CREATE TABLE IF NOT EXISTS workspace_allowed_accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      bank_account_id uuid NOT NULL REFERENCES bank_accounts(id),
      granted_by_profile_id uuid NOT NULL REFERENCES profiles(id),
      revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, bank_account_id) WHERE revoked_at IS NULL
    );

Semantics recap (see `database-structure-workspaces-and-views.md`):

- Pure denormalization of `workspace_connection_links.account_scope_json`.
- Background jobs regenerate it from JSON scopes.
- Must not be mutated independently by application logic.

### 6.2 workspace_allows_account helper

Convenience helper for application-level checks (not used from RLS on these tables to avoid recursion):

    CREATE OR REPLACE FUNCTION workspace_allows_account(workspace uuid, bank_account uuid)
    RETURNS boolean AS $$
    -- Application-level convenience helper (not used inside RLS after inlining).
    -- Never call it from policies on workspace_allowed_accounts or workspace_connection_links
    -- to avoid recursive evaluation.
    -- Callers must align the workspace argument with their current auth context so EXISTS
    -- predicates stay selective.
    SELECT
      EXISTS (
        SELECT 1
        FROM workspace_allowed_accounts waa
        WHERE waa.workspace_id = workspace
          AND waa.bank_account_id = bank_account
          AND waa.revoked_at IS NULL
      )
      OR
      EXISTS (
        SELECT 1
        FROM workspace_connection_links wcl
        WHERE wcl.workspace_id = workspace
          AND wcl.revoked_at IS NULL
          AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
          AND (
            wcl.account_scope_json IS NULL
            OR bank_account::text IN (
              SELECT jsonb_array_elements_text(wcl.account_scope_json)
            )
          )
      );
    $$ LANGUAGE sql STABLE;

Notes:

- Runs as `SECURITY INVOKER` in the default design:
  - So it stays behind FORCE RLS.
- If future use cases require bypassing RLS:
  - Switch to `SECURITY DEFINER` carefully.
  - Harden `search_path` and role grants to avoid privilege escalation.
- Performance:
  - Prefer pre-joining scopes in long-running reports rather than calling this helper in deep predicates.

---

## 7. Constraint and Validation Functions + Triggers

This section centralizes the core constraint/validation triggers referenced by other files.

### 7.1 Append-only enforcement for transactions

Function:

    CREATE OR REPLACE FUNCTION prevent_transaction_mutation()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'transactions are append-only';
    END;
    $$ LANGUAGE plpgsql;

Triggers:

    CREATE TRIGGER transactions_no_update
      BEFORE UPDATE ON transactions
      FOR EACH ROW
      EXECUTE FUNCTION prevent_transaction_mutation();

    CREATE TRIGGER transactions_no_delete
      BEFORE DELETE ON transactions
      FOR EACH ROW
      EXECUTE FUNCTION prevent_transaction_mutation();

Semantics:

- Any UPDATE/DELETE attempt on `transactions` results in an exception.
- App role should not have UPDATE/DELETE privileges regardless; this trigger is an extra guardrail.

---

### 7.2 Category parent scope consistency

Function:

    CREATE OR REPLACE FUNCTION ensure_category_parent_scope()
    RETURNS trigger AS $$
    DECLARE
      parent_profile uuid;
    BEGIN
      IF NEW.parent_id IS NULL THEN
        RETURN NEW;
      END IF;

      SELECT profile_id INTO parent_profile
      FROM categories
      WHERE id = NEW.parent_id;

      IF (parent_profile IS DISTINCT FROM NEW.profile_id) THEN
        RAISE EXCEPTION
          'category parent must share profile scope (both NULL for system categories)';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

Constraint trigger:

    CREATE CONSTRAINT TRIGGER categories_parent_scope_ck
      AFTER INSERT OR UPDATE ON categories
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION ensure_category_parent_scope();

Semantics:

- Ensures parent/child categories share the same `profile_id` (or both NULL for system categories).
- Deferrable so bulk inserts/updates can be committed as a batch.

---

### 7.3 Workspace category parent scope

Function:

    CREATE OR REPLACE FUNCTION ensure_workspace_category_parent_scope()
    RETURNS trigger AS $$
    DECLARE
      parent_workspace uuid;
    BEGIN
      IF NEW.parent_id IS NULL THEN
        RETURN NEW;
      END IF;

      SELECT workspace_id INTO parent_workspace
      FROM workspace_categories
      WHERE id = NEW.parent_id;

      IF parent_workspace IS DISTINCT FROM NEW.workspace_id THEN
        RAISE EXCEPTION
          'workspace category parent must belong to same workspace';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

Constraint trigger:

    CREATE CONSTRAINT TRIGGER workspace_categories_parent_scope_ck
      AFTER INSERT OR UPDATE ON workspace_categories
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION ensure_workspace_category_parent_scope();

Semantics:

- Enforces a well-formed tree for `workspace_categories`:
  - Parent and child must belong to the same workspace.

---

### 7.4 workspace_connection_links account scope validation

Function:

    CREATE OR REPLACE FUNCTION validate_workspace_account_scope()
    RETURNS trigger AS $$
    DECLARE
      account_id uuid;
    BEGIN
      IF NEW.account_scope_json IS NULL THEN
        RETURN NEW;
      END IF;

      IF jsonb_typeof(NEW.account_scope_json) <> 'array' THEN
        RAISE EXCEPTION 'account_scope_json must be array of UUID strings';
      END IF;

      FOR account_id IN
        SELECT jsonb_array_elements_text(NEW.account_scope_json)::uuid
      LOOP
        IF NOT EXISTS (
          SELECT 1
          FROM bank_accounts ba
          WHERE ba.id = account_id
            AND ba.connection_id = NEW.connection_id
            AND ba.deleted_at IS NULL
        ) THEN
          RAISE EXCEPTION
            'account_scope_json contains account % that is not part of connection %',
            account_id, NEW.connection_id;
        END IF;
      END LOOP;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

Constraint trigger:

    CREATE CONSTRAINT TRIGGER workspace_connection_links_scope_ck
      AFTER INSERT OR UPDATE ON workspace_connection_links
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION validate_workspace_account_scope();

Semantics:

- Enforces that:
  - `account_scope_json` is either NULL or an array of UUID strings.
  - All referenced accounts:
    - Exist.
    - Belong to the same connection.
    - Are not soft-deleted.

---

### 7.5 transaction_overlays split validation

Function:

    CREATE OR REPLACE FUNCTION validate_transaction_overlay_splits()
    RETURNS trigger AS $$
    DECLARE
      split_record jsonb;
      total bigint := 0;
      base_amount bigint;
    BEGIN
      IF NEW.splits IS NULL OR jsonb_typeof(NEW.splits) <> 'array' THEN
        IF NEW.splits IS NOT NULL THEN
          RAISE EXCEPTION 'splits must be a JSON array';
        END IF;
        RETURN NEW;
      END IF;

      FOR split_record IN
        SELECT jsonb_array_elements(NEW.splits)
      LOOP
        IF jsonb_typeof(split_record) <> 'object'
           OR NOT split_record ? 'amount_cents' THEN
          RAISE EXCEPTION 'each split must include amount_cents';
        END IF;

        total := total + (split_record ->> 'amount_cents')::bigint;
      END LOOP;

      SELECT amount_cents INTO base_amount
      FROM transactions
      WHERE id = NEW.transaction_id;

      IF base_amount IS NULL THEN
        RAISE EXCEPTION 'transaction not found for overlay';
      END IF;

      IF total <> base_amount THEN
        RAISE EXCEPTION
          'split totals (%s) must equal transaction amount (%s)',
          total, base_amount;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

Trigger:

    CREATE TRIGGER transaction_overlays_splits_validate
      BEFORE INSERT OR UPDATE ON transaction_overlays
      FOR EACH ROW
      EXECUTE FUNCTION validate_transaction_overlay_splits();

Semantics:

- Guarantees split integrity:
  - `splits` must be an array.
  - Each element must have `amount_cents`.
  - Sum of all `amount_cents` must equal the base transaction `amount_cents`.
- Prevents drift between overlay splits and the immutable ledger.

---

## 8. When Changing Constraints or Indexes

Whenever you:

- Add/change unique constraints.
- Modify soft-delete behavior.
- Introduce/remove GIN/BRIN indexes.
- Adjust triggers/validation functions.

You must:

1. Update this file to describe the new behavior.  
2. Update any per-area schema docs (auth, categories, workspaces, budgets, ledger, sync) that are impacted.  
3. Update `database-structure-migrations-ops-and-testing.md` to keep CI/validation scripts aligned.  
4. Run and extend the CI checks:
   - Nullability and partial-index audits.
   - GIN/index cost validation.
   - Any pgTAP or plan-validation tests tied to the changed tables.

This keeps the schema’s constraints, indexes, and triggers coherent with RLS, performance expectations, and the documented domain model.


---

<!-- source: steering/database/database-structure-identity-and-access.md -->

agent/steering/database-structure-identity-and-access.md
# Database Structure — Identity, Profiles, Subscriptions, API Keys

This file covers:

- Auth-core identity tables (users, user_identities, auth_sessions, refresh_tokens, verification_tokens, api_keys, session_transfer_tokens)
- Profiles and subscriptions (domain-level identity, billing linkage)
- API keys (PATs) and their ownership rules

Use this when you’re touching auth, identity, or per-user access surfaces. RLS policies and raw SQL live in `database-structure-rls-and-access-control.md` and `database-structure-rls-policies-and-ddl.sql.md`.

---

## 1. Auth / Identity (auth-core tables)

Auth-core owns identity and session tables. Auth.js adapters and schemas are not used in this repo; there is no legacy compatibility requirement.

- Token model: JWT access tokens (short-lived) + opaque refresh tokens (rotated, hash envelopes) + PATs (opaque, hash envelopes) as described in `docs/auth-migration/end-auth-goal.md`.
- Key tables:
  - `users` — canonical auth user; includes default workspace/profile linkage.
  - `user_identities` — external identity linkage (Google, etc.).
  - `auth_sessions` — session records with MFA level and device metadata.
  - `refresh_tokens` — rotated refresh tokens (family_id, last4, hash_envelope, scopes).
  - `verification_tokens` — opaque tokens for email verification/passwordless flows (hash_envelope).
  - `session_transfer_tokens` — short-lived tokens to bridge mobile OAuth flows.
  - `api_keys` — PATs; workspace- or user-scoped with scope arrays and hash_envelope.
- Access pattern:
  - Use auth-core repositories/services; do not query these tables directly from apps.
  - RLS/GUCs: set `app.user_id`, `app.profile_id` (when applicable), `app.workspace_id`, `app.mfa_level`, `app.service_id` per request; clear between pool usages.

---

## 2. Profiles

Profiles represent domain-level identity and preferences, distinct from auth-core `users`. All core application tables use `profiles.id` (not `users.id`) as the key for ownership.

Table: `profiles`

Core columns:

- `id` — UUID PK.
- `user_id` — FK to `users(id)` NOT NULL, UNIQUE:
  - v1 assumption: one profile per auth-core user.
- `timezone` — TEXT:
  - User’s preferred timezone; used for date bucketing and UI defaults.
- `currency` — `VARCHAR(3) CHECK (char_length(currency) = 3)`:
  - Preferred currency for personal, non-workspace flows.
- `settings` — JSONB:
  - Arbitrary user-level settings (feature flags, preferences, etc.).
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Uniqueness and future evolution:

- There is a UNIQUE constraint on `user_id` in v1.
- Supporting multiple profiles per user later will require:
  - Dropping this uniqueness constraint.
  - Introducing application-level semantics (e.g. `primary_profile_id` on `users`).
  - Updating any logic that assumes 1:1 between `users` and `profiles`.

RLS and roles:

- RLS on `profiles` ensures:
  - A profile can see and mutate only its own row.
- Detailed policies and SQL definitions are in:
  - `database-structure-rls-and-access-control.md`
  - `database-structure-rls-policies-and-ddl.sql.md`

---

## 3. Subscriptions

Subscriptions link profiles to Stripe billing state and control seat/slot limits.

Table: `subscriptions`

Core columns:

- `id` — UUID PK.
- `profile_id` — FK to `profiles(id)` NOT NULL.
- `stripe_customer_id` — TEXT, optional but usually present once billing is set up.
- `stripe_subscription_id` — TEXT, optional; null when not yet subscribed or in trial-only scenarios.
- `slot_limit` — INT:
  - Configurable limit on a resource (e.g., number of connections, bank accounts, or workspaces).
  - Exact semantics are scoped at the application/service layer.
- `status` — TEXT with CHECK constraint:
  - `CHECK (status IN ('trialing','active','past_due','canceled','incomplete'))`
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Indexes:

- Index on `(profile_id)` for quick lookups.
- Optional index on `(status)` to filter active/trialing subscriptions quickly.

RLS behavior:

- RLS ensures:
  - A profile sees only its own `subscriptions` row(s).
- The policy definition is in `database-structure-rls-policies-and-ddl.sql.md` (see `subscriptions_owner`).

Billing flows and invariants:

- Application code must ensure Stripe webhooks and dashboard changes are reconciled with this table.
- Slot limits enforced by the app must read from `subscriptions.slot_limit` atomically with the relevant creation actions (e.g., provisioning connections or workspaces).

---

## 4. API Keys (PATs)

API keys provide programmatic access (PATs) for UI and external integrations. They are always owned by a profile and may optionally be scoped to a workspace.

Table: `api_keys`

Core columns:

- `id` — UUID PK.
- `user_id` — FK to `users(id)` NOT NULL.
- `profile_id` — FK to `profiles(id)` NOT NULL.
- `workspace_id` — FK to `workspaces(id)` NULL:
  - NULL → personal key.
  - Non-NULL → workspace-scoped key.
- `name` — TEXT:
  - Human-readable label for the key.
- `key_hash` — JSONB UNIQUE:
  - Stores hashed token envelope: algorithm, key_id, hash.
  - Format is shared with other token-hash columns; see `database-structure-tokens-and-secrets.md`.
- `scopes` — JSONB DEFAULT `'[]'`:
  - List of fine-grained API scopes, modeled as JSON (e.g. `["transactions:read", "budgets:write"]`).
- `last_used_at` — TIMESTAMPTZ, optional:
  - Updated by backend on authenticated calls.
- `expires_at` — TIMESTAMPTZ, nullable:
  - Key expires and becomes unusable when `expires_at <= now()`.
- `revoked_at` — TIMESTAMPTZ, nullable:
  - Key is considered inactive once revoked; RLS and queries treat `revoked_at IS NULL` as active.
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Key ownership semantics:

- Keys are always owned by a profile:
  - `profile_id` is NOT NULL.
- Keys may be:
  - Personal: `workspace_id IS NULL`.
  - Workspace-scoped: `workspace_id` points to a workspace where the profile is a member (and typically `owner` or `admin`).
- When a member is removed from a workspace:
  - Any workspace-scoped keys for that profile and workspace must be revoked in the same transaction to avoid dangling access.

Constraints and triggers:

- CHECK constraint to enforce profile ownership:
  - `CHECK (profile_id IS NOT NULL)`
- Constraint triggers:
  - `api_keys_validate_profile_link`:
    - DEFERRABLE INITIALLY DEFERRED.
    - Ensures that any `profile_id` on an `api_keys` row belongs to the same `user_id` (i.e. `profiles.user_id == user_id`).
  - `api_keys_validate_workspace_link`:
    - DEFERRABLE INITIALLY DEFERRED.
    - Ensures that when `workspace_id` is non-NULL:
      - The referenced workspace has a `workspace_members` row for the profile.
      - `role` is in `('owner','admin')` (or stricter, as defined at the RLS/policy layer).
- Indexes:
  - Index on `(user_id)`.
  - Index on `(profile_id)`.
  - Index on `(workspace_id)`.
  - Partial index on `(revoked_at IS NULL)` for active keys.
  - `key_hash` UNIQUE index.

Key hash envelope:

- `key_hash` stores JSON metadata:
  - Example structure: `{ "algo": "hmac-sha256", "key_id": "v1", "hash": "<base64>" }`
- Design choices:
  - JSONB is used instead of TEXT so:
    - The system can query by algorithm/key_id to identify keys needing rotation.
    - Multiple algorithms can coexist during phased rotations.
  - Secret material is never stored in plaintext; only the hash is persisted.

RLS and surface constraints:

- RLS for `api_keys` is designed so:
  - A user can see and manage only their own keys (`user_id = app.user_id`).
- Policy definition is in `database-structure-rls-policies-and-ddl.sql.md` (see `api_keys_self`).

Operational expectations:

- Key generation helpers:
  - Produce tokens in the canonical `<token_id>.<token_secret>` format.
  - Persist only the token hash envelope to `key_hash`, never the raw token.
  - Return the token to the caller exactly once (displayed in UI, never retrievable again).
- Rotation and auditing:
  - Rotation jobs may query `key_hash` for stale algorithms and flag or reissue keys.
  - `last_used_at` is updated via separate, batched writes to keep hot paths efficient.

---

## 5. Cross-Cutting Identity and Access Invariants

These invariants must hold across all identity/access tables:

- UUIDs everywhere:
  - All PKs and FKs use UUID types consistently (`@db.Uuid`).
- No plaintext secrets:
  - Session tokens, verification tokens, API keys, and view link tokens are all stored only as hashed envelopes (see tokens/secrets doc).
- Strong uniqueness:
  - `users.email_lower` is globally unique.
  - `accounts(provider, provider_account_id)` unique.
  - `sessions.session_token_hash` and `verification_tokens.token_hash` unique.
  - `api_keys.key_hash` unique.
- Timestamps:
  - All rows have `created_at` (and usually `updated_at`) as `TIMESTAMPTZ`.
- RLS:
  - Domain-level identity (profiles, api_keys, subscriptions) is protected via RLS and GUC-based context.
  - Auth-core tables rely on the same GUC-based context; do not bypass RLS with special roles.

For security-sensitive changes (e.g., token format or schema changes to these tables), always load:

- `database-structure-tokens-and-secrets.md`
- `database-structure-rls-and-access-control.md`
- `database-structure-rls-policies-and-ddl.sql.md`


---

<!-- source: steering/database/database-structure-migrations-ops-and-testing.md -->

agent/steering/database-structure-migrations-ops-and-testing.md
# Database Structure — Migrations, Data Integrity, Ops, and Testing

This file captures the operational side of the schema:

- Data integrity and retention rules
- Budget actuals computation contract
- Migrations and environments (Prisma + Neon)
- Testing and hardening (RLS, deferrables, append-only)
- Lifecycle jobs and TTL sweeps
- GDPR / incident response
- Ready-for-prod checklist
- Neon-specific ops notes

Use this when you’re:

- Writing migrations
- Adding TTL / housekeeping jobs
- Building CI checks around the DB
- Debugging performance or access control in staging/prod

---

## 1. Data Integrity and Retention

Core invariants:

- Base transactions are append-only:
  - `transactions` never receives UPDATE or DELETE from `app_user`.
  - Append-only is enforced via:
    - Revoke UPDATE/DELETE from `app_user` on `transactions`.
    - Triggers that raise if UPDATE/DELETE is attempted.

- Soft delete on user-generated tables:
  - `deleted_at` (or `revoked_at`) marks rows as archived.
  - RLS predicates and partial indexes always filter on:
    - `WHERE deleted_at IS NULL` for active rows.
    - `WHERE revoked_at IS NULL` for active links/permissions.

- TTL sweeps:
  - `session_page_payloads.expires_at` drives periodic cleanup:
    - Target retention: 30–90 days (configurable).
  - Similar sweeps remove:
    - Expired `sessions` (if DB-backed).
    - Expired `verification_tokens`.
    - Expired `view_links`.
    - Revoked/expired `workspace_connection_links` projections.
    - Large sync payload blobs tied to completed/expired sync sessions.

- Scheduled housekeeping jobs:
  - Run under a dedicated `maintenance_user`.
  - Must:
    - Operate in transactions.
    - Respect FK ordering (delete children before parents).
    - Emit structured logs/metrics (rows deleted, duration).
    - Raise alerts when jobs fail or delete zero rows for multiple runs.

- Plaid / provider revocation flows:
  - For revoked Plaid items or deleted connections:
    - Set `connections.status` to `'deleted'` or `'error'`.
    - Set `connections.deleted_at`.
    - Revoke all workspace access:
      - Mark `workspace_connection_links.revoked_at` for affected rows.
      - Mark `workspace_allowed_accounts.revoked_at` for impacted accounts.
  - Effect:
    - Soft-deleting connections or `bank_accounts` hides:
      - The accounts themselves.
      - Their transactions and overlays.
    - Data remains in the DB for maintenance/audit (via maintenance roles), but is invisible to normal app traffic.

- GDPR-style deletion:
  - Implemented via a script (e.g. `tooling/scripts/gdpr-delete.ts`) that:
    - Walks from `users.id` to:
      - Auth-core records (`users`, `user_identities`, `auth_sessions`, `refresh_tokens`, `verification_tokens`, `session_transfer_tokens`, `api_keys`).
      - `profiles`.
      - `workspaces` and `workspace_members`.
      - `connections` and bank-access caches.
      - `transaction_overlays`.
      - Sync artifacts (`sync_sessions`, `session_page_payloads`, `sync_audit_log`, etc.).
    - Performs soft-deletes / revocations across this graph.
    - Leaves immutable `transactions` intact:
      - RLS prevents the deleted user from seeing them afterwards.

  - Requirements:
    - Script supports `--dry-run` to log planned mutations only.
    - Produces structured logs/audit artifacts stored for incident review.
    - Tests assert:
      - After deletion, RLS denies all data when the user attempts to query.
      - `transactions` still exist but have no overlays/cache rows owned by the deleted profile.

---

## 2. Budget Actuals Computation Contract

`budget_actuals` is a materialized table (or materialized view backing a thin `budget_actuals_mv` view) that stores precomputed budget performance per envelope and period.

Key fields and behavior:

- Stored dimensions:
  - `plan_id`
  - `version_id`
  - `envelope_id`
  - `workspace_id` (denormalized from `budget_plans.workspace_id`)
  - `period` (DATE)
  - `currency` (3-char code)
  - `rollup_mode` (TEXT: `'posted' | 'authorized' | 'both'`)
  - `posted_amount_cents`
  - `authorized_amount_cents`
  - `workspace_category_id`
  - `updated_at`

- Filter resolution:
  - Source of transactions is constrained by:
    - `view_id` if provided (live filters).
    - `view_filter_snapshot` if the plan/version stored a frozen filter.
  - Account scoping:
    - Applies `workspace_connection_links.account_scope_json` and/or `workspace_allowed_accounts` exactly as RLS does.

- Currency handling:
  - `budget_plans.currency` must match `workspaces.settings->>'default_currency'`.
  - The `budget_plans_enforce_currency` trigger enforces alignment.
  - FX support is future work:
    - For now, ignore transactions whose currency differs from the plan/workspace currency.

- Aggregation:
  - Sum `transactions.amount_cents` per `(plan_id, version_id, envelope_id, period)` according to:
    - `rollup_mode`:
      - `'posted'`: only posted amounts.
      - `'authorized'`: only authorized amounts.
      - `'both'`: track both.
  - Category resolution:
    - Use `effective_workspace_category(...)` to derive `workspace_category_id` for aggregates.
    - Profile-specific overlays (`effective_transaction_category(...)`) stay out of materialized data and are applied at query time for personalized views.

- Period derivation:
  - `period := (posted_at AT TIME ZONE workspace_tz)::date`
    - `workspace_tz = COALESCE(
        workspaces.settings->>'timezone',
        owner_profile.timezone,
        'UTC'
      )`
  - Budget refreshers and ad-hoc reports must reuse *exactly* this expression so the same transaction falls into the same date bucket everywhere.

- Refresh strategy:
  - Nightly full refresh job.
  - Incremental refresh after envelope/transaction writes where practical.
  - Implementation:
    - Truncate + reinsert, or upsert per partition.
  - Indexes:
    - `budget_actuals(version_id, period)`
    - `budget_actuals(plan_id, version_id, period)`
    - `budget_actuals(workspace_id, period)`

- RLS and views:
  - RLS lives on the underlying `budget_actuals` table.
  - Optional compatibility view:

        CREATE VIEW budget_actuals_mv AS
        SELECT * FROM budget_actuals;

    Consumers may query `budget_actuals_mv`, but security is enforced by RLS on `budget_actuals`.

- Partitioning:
  - v1: single table, indexes only.
  - Future:
    - Partition by `(workspace_id, period)` if needed.
    - Denormalized `workspace_id` exists specifically to make partitioning painless later.

- Testing:
  - Contract tests verify:
    - `budget_plans_enforce_currency` blocks currency mismatches.
    - Refresh jobs honor `rollup_mode`, filter snapshots, and account scope RLS.
    - Planned indexes are used (via `EXPLAIN (ANALYZE, BUFFERS)` snapshots in CI).

---

## 3. Migrations and Environments (Prisma + Neon)

Migration strategy:

- Use Prisma Migrate for:
  - Development, preview, and production.
  - Backed by Neon branches per PR for preview deployments.

- Seeds:
  - On signup:
    - Create `profiles` rows for new users.
  - On initial bootstrap/seeding:
    - Insert system categories (`categories` with `profile_id IS NULL`).
  - Seeding runs under a migration/service role with `BYPASSRLS`.
    - `app_user` must not be able to insert:
      - System rows (e.g., `profile_id IS NULL` categories).
      - Default workspace trees with `workspace_id = NULL`.

- DDL ownership:
  - A dedicated migration role owns:
    - Schemas.
    - Tables.
    - Functions.
    - Policies.
  - `app_user` has no DDL permissions; all changes go through migrations.

- Triggers, exclusions, BRIN, partial indexes:
  - Defined in SQL migrations rather than relying solely on Prisma.
  - Mirror names via Prisma `@map`/`@@map` so the ORM stays aligned.

- Helper functions and RLS policies:
  - Functions like:
    - `workspace_allows_account(...)`
    - `validate_transaction_overlay_splits(...)`
  - RLS `CREATE POLICY` statements:
    - Live in SQL migrations.
    - Are versioned along with schema changes for deterministic deploys.

- Foreign keys:
  - Every FK must explicitly specify `ON DELETE` behavior:
    - `ON DELETE RESTRICT` for soft-delete-first parents:
      - `profiles`, `workspaces`, `connections`, `bank_accounts`, `categories`, `workspace_categories`, etc.
    - `ON DELETE CASCADE` for:
      - Sync session fan-out:
        - `session_page_payloads.sync_session_id`
        - `session_idempotency.sync_session_id`
        - `session_leases.sync_session_id`
        - `sync_audit_log.sync_session_id`
      - Cache tables:
        - `user_connection_access_cache.*`
        - `profile_transaction_access_cache.*`
    - Never rely on default `NO ACTION`.

- Nullability:
  - FK columns (`*_id`), hashes, statuses, timestamps:
    - Must be `NOT NULL` in the canonical schema.
  - `created_at`:
    - `TIMESTAMPTZ NOT NULL DEFAULT now()`.
  - `updated_at`:
    - Managed by Prisma via `@updatedAt`; **no** SQL DEFAULT.
  - CI audit (e.g. `tooling/scripts/check-not-null.ts`) should query `information_schema.columns` to ensure:
    - No monitored column becomes nullable.

- Schema drift control:
  - CI job (e.g. `pnpm db:schema-drift`) should:
    - `pg_dump --schema-only` from the Neon preview branch.
    - Diff against `tooling/schema-snapshots/canonical.sql`.
    - Fail on unexpected differences.
  - This document stays as the consumer guide;
    - The checked-in schema snapshot is the source of truth.

- Extensions:
  - Enable via migrations:
    - `pgcrypto` for UUID generation / crypto helpers.
    - `btree_gist` for exclusion indexes.
    - `pg_trgm` (optional) for search/trigram indexes.

---

## 4. Testing and Hardening

### 4.1 RLS Verification (Phase 2+)

RLS verification is treated as a security boundary:

- pgTAP tests (e.g. `tooling/tests/pgtap/rls_contract.sql`):

  - Seed:
    - Owners, admins, editors, viewers, unaffiliated profiles, anonymous callers.
  - For each role:
    - Exercise `SELECT/INSERT/UPDATE/DELETE` on all key tables.
    - Assert:
      - Allowed paths succeed.
      - Denied paths raise `ERROR: new row violates row-level security policy`.

- Application E2E tests (Playwright or equivalent):

  - Run main flows for each role:
    - Dashboard.
    - Overlays.
    - Budgets.
    - Sharing and view links.
  - Ensure:
    - Denials from RLS propagate as graceful errors in the UI/SDK.

- Smoke test CLI:

  - `tooling/scripts/rls-smoke.ts`:
    - Connects as `app_user` **without** any `SET LOCAL` context.
    - For each RLS-enabled table:
      - Executes `SELECT 1 FROM <table> LIMIT 1`.
      - Asserts zero rows are visible.
  - Wire into CI:
    - `pnpm db:rls-smoke`.

- RLS coverage query:

  - `tooling/scripts/check-rls-policies.ts` should run queries like:

        SELECT tab.relname
        FROM pg_class tab
        JOIN pg_namespace ns ON ns.oid = tab.relnamespace
        WHERE relkind = 'r'
          AND pg_has_role(tab.relowner, 'USAGE')
          AND tab.rowsecurity = true
        EXCEPT
        SELECT polrelid::regclass::text
        FROM pg_policies;

    - Must return zero rows.
    - Include checks for `FORCE ROW LEVEL SECURITY` as well.

- Performance guard:

  - For representative queries under RLS (owner/admin/editor/viewer), capture:

        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)

    - Run against seeded data in a Neon preview branch.
    - Store plans under `tooling/plans/...`.
    - Validate via `tooling/scripts/validate-plans.ts`, failing CI if:
      - Costs or row counts exceed agreed thresholds.
      - Queries devolve into sequential scans on hot tables.

### 4.2 Deferrable Constraints and Triggers (Phase 2+)

We rely on several `DEFERRABLE INITIALLY DEFERRED` constraints/triggers, e.g.:

- `categories_parent_scope_ck`
- `workspace_categories_parent_scope_ck`
- `api_keys_validate_profile_link`
- `api_keys_validate_workspace_link`
- `workspace_connection_links_scope_ck`
- `transaction_overlays_splits_validate`

Requirements:

- Catalog them in `tooling/scripts/check-deferrables.ts`.
  - Fail CI if new deferrables are added without tests.

- Bulk transaction tests:

  - Insert/update conflicting rows within a single transaction.
  - Confirm:
    - Deferrable validations fire at COMMIT.
    - No deadlocks or surprising behavior.

- Concurrency tests:

  - Parallel transactions touching the same parents.
  - Ensure constraint timing does not produce anomalies.

- Prisma migration regression:

  - Keep deferrable constraints defined in SQL migrations.
  - `pnpm db:check-deferrables` should introspect `pg_constraint` / `pg_trigger`:
    - `condeferrable = true`
    - `condeferred = true`.

### 4.3 Append-Only Enforcement (Phase 2+)

For `transactions`:

- Tests:

  - pgTAP / Prisma tests attempt UPDATE/DELETE as `app_user`.
  - Expect `ERROR: transactions are append-only` from `prevent_transaction_mutation()`.

- Behavior:

  - Category/description/splits edits are implemented via:
    - `transaction_overlays`.
    - Or new append entries (if we ever support a “corrected” copy model).

- E2E tests:

  - API surfaces structured `409` with a clear message when the client attempts forbidden updates.
  - No generic 500s on append-only violations.

### 4.4 Neon Index + Plan Validation (Phase 2+)

Heavy workloads must keep good plans over time:

- Seed realistic data:

  - `tooling/scripts/seed-demo.ts --rows 500000` on a fresh Neon branch.

- Capture plans (`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`) for:

  - Transaction feeds filtered by workspace/profile/date.
    - `transactions` joined to `bank_accounts` and workspace scopes.
  - Budget aggregation via `budget_actuals` (and optional `budget_actuals_mv`).
  - Connection and bank account listings with workspace scoping.
  - Sync session / audit history queries:
    - `sync_sessions` + `session_page_payloads` + `sync_audit_log`.

- Validate via `tooling/scripts/validate-plans.ts`:

  - Check for:
    - Index scans using:
      - `transactions_account_id_posted_at_idx` (or equivalent).
      - BRIN index on `transactions(posted_at)` for long-range scans.
    - GIN index usage on JSONB-heavy predicates:
      - `scope_json` (workspace_members).
      - `account_scope_json` (workspace_connection_links).
      - `raw_payload` (transactions, sync payloads).
    - Workspace membership lookups leveraging composite B-tree indexes:
      - `workspace_members(workspace_id, member_profile_id, role)`.
      - `workspace_allowed_accounts(workspace_id, bank_account_id, revoked_at)`.
      - `workspace_connection_links(workspace_id, connection_id, revoked_at, expires_at)`.

  - Wire into CI as `pnpm db:plan-validate`.

### 4.5 Category Resolver Parity

- `tooling/tests/pgtap/effective_category.sql`:

  - Generates randomized combinations of:
    - System categories.
    - Workspace categories.
    - Profile/view/workspace overrides.
    - Transaction overlays.
  - Compares:
    - `effective_transaction_category(...)` and `effective_workspace_category(...)` outputs.
    - Against equivalent SQL join implementations.
  - Ensures precedence and behavior remain in sync as schema evolves.

### 4.6 Budget Actuals Invariants

- Tests must cover:

  - `budget_plans_enforce_currency` trigger:
    - Reject mixed-currency plans.
  - Nightly + write-triggered refresh jobs:
    - Respect `rollup_mode`.
    - Ignore foreign-currency transactions until FX is implemented.
    - Enforce workspace/account scope RLS.

  - Query plan assertions:
    - Confirm key indexes on `(version_id, period)` and `(plan_id, version_id, period)` are used.

---

## 5. Lifecycle Jobs and TTL Sweeps

Lifecycle jobs are initially allowed to be run manually, with automation in Phase 2+.

- TTL sweeps (nightly):

  - Delete expired:
    - `sessions` (if DB-backed) using `expires`.
    - `verification_tokens` using `expires`.
    - `view_links` using `expires_at`.
    - `workspace_connection_links` that are:
      - Revoked (`revoked_at IS NOT NULL`) or
      - Expired (`expires_at <= now()`).
    - `session_page_payloads` using `expires_at`.
    - Large sync payload blobs tied to completed/expired sync sessions.

- Denormalization refresh:

  - QStash/Vercel cron (or equivalent) jobs:
    - Regenerate `workspace_allowed_accounts` from `workspace_connection_links.account_scope_json`.
      - Treat `workspace_allowed_accounts` as a projection only.
    - Refresh `budget_actuals` (and optional `budget_actuals_mv`).

- Execution context:

  - Jobs run as `maintenance_user` with:

        SET LOCAL app.profile_id = NULL;
        SET LOCAL app.workspace_id = NULL;

    unless impersonation is explicitly required.

  - `maintenance_user`:
    - Has DELETE privilege on target tables.
    - Only bypasses RLS where explicitly documented.

- FK and order-of-operations:

  - Purge child tables before parent tables to avoid FK violations, e.g.:

    - Delete `session_page_payloads` before deleting `sync_sessions`.
    - Delete `sync_audit_log` entries referencing a `sync_session` before the session is removed (if cascading is not already configured).

- Testing:

  - Regression tests that run TTL scripts against seeded data must confirm:
    - RLS permits the maintenance role to delete the intended rows.
    - Cache tables (`user_connection_access_cache`, `profile_transaction_access_cache`) do not contain orphaned references.

- Observability:

  - Each job should:
    - Emit structured logs (JSON) summarizing:
      - Rows affected per table.
      - Duration.
      - Any errors.
    - Emit metrics for observability/alerting.
  - Alerts:
    - On failure.
    - On suspiciously low activity (e.g., zero rows deleted for multiple days in a row).

---

## 6. Ready-for-Prod Checklist

Before a production launch:

- Identity and keys:

  - UUIDs everywhere, FK types consistent (`uuid` vs `text` alignment).
  - Auth-core:
    - Uses UUID PKs.
    - Stores lowercased emails with unique index (`email_lower`).
    - Stores only hashed/enveloped tokens (refresh, verification, PATs, session-transfer).

- Constraints:

  - All documented UNIQUE constraints implemented:
    - Connections, bank accounts, transactions, overlays.
    - Category trees and overrides.
    - Workspace/view category override uniqueness.
    - Active-rows uniqueness (partial indexes with `deleted_at IS NULL` / `revoked_at IS NULL`).

- Secrets and tokens:

  - Hashes for:
    - PATs (`api_keys.key_hash`).
    - View link tokens / passcodes.
    - Session tokens (if DB-backed).
    - Verification tokens.
  - Provider secrets encrypted, not hashed:
    - Plaid access tokens, webhooks, etc.

- Money:

  - All monetary values stored as:
    - `BIGINT` cents + 3-char currency (except `budget_envelopes.limit_cents` paired with plan currency).
  - Signed convention:
    - Inflows = positive.
    - Outflows = negative.
    - No zero-valued base transactions.

- Indexes:

  - GIN and partial indexes in place for JSONB and “active rows” (non-deleted, non-revoked).
  - BRIN on `transactions(posted_at)` for archival queries.
  - Workspace and membership indexes for RLS-heavy predicates.

- RLS + Prisma:

  - RLS policies wired on all user-facing and cache tables.
  - Prisma transactions reliably set:

        SET LOCAL app.user_id = ...
        SET LOCAL app.profile_id = ...
        SET LOCAL app.workspace_id = ...

  - `withAppContext` (or equivalent) is the **only** code path to talk to the DB for user traffic.
  - RLS smoke, coverage, and correctness tests are green.

- Seeds and fixtures:

  - System categories seeded (with `profile_id IS NULL`).
  - Default workspace flows tested.
  - Demo/fixture data available for staging/previews.

- E2E coverage:

  - Tested end-to-end flows:
    - Connection sharing.
    - View links.
    - Category overrides and overlays.
    - Budget actuals.

---

## 7. Neon Ops Notes

Neon-specific considerations:

- WAL and write throughput:

  - Batch chatty writes (sessions, sync logs) via:
    - Buffered inserts.
    - Or `COPY` where suitable.
  - Goal: reduce WAL pressure and contention on shared storage.

- Large payloads:

  - Archive bulky `raw_payload` blobs (e.g., sync pages) to:
    - Colder storage, or
    - Partitioned tables reserved for logs/archives.
  - Keep hot tables lean to improve cache and query performance.

- Storage and vacuum:

  - Monitor branch storage quotas.
  - After large backfills or data migrations:
    - Run aggressive vacuum.
    - Review `pg_stat_all_indexes` and `pg_stat_user_tables`.
  - Schedule periodic `pg_stat_statements` reviews to:
    - Spot slow queries.
    - Catch regressions related to RLS predicate complexity.

- Partitioning:

  - Consider partitioning `transactions` once volumes grow:
    - Time-based (e.g., monthly partitions).
    - Or by `connection_id` (if access patterns justify).
  - BRIN indexes help for large tables, but partitions further simplify:
    - Retention.
    - Archival.
    - Vacuum pressure.

- Performance observability:

  - Track `pg_stat_statements` specifically for:
    - Queries involving RLS-heavy joins across connections, accounts, transactions, and workspace scopes.
  - Use recorded plans + the `plan-validate` CI to ensure:
    - Index usage remains stable after schema or policy changes.

This file, together with the schema, RLS, constraints, and budget docs, defines the operational contract for keeping the SuperBasic Finance database safe, fast, and maintainable in production.


---

<!-- source: steering/database/database-structure-overview.md -->

*Legacy Auth.js database overview removed. Auth-core is the source of truth for identity/tokens; see `docs/auth-migration/end-auth-goal.md` and `agent/steering/database/database-structure-identity-and-access.md` for current schema guidance.*

<!-- source: steering/database/database-structure-reference.md -->

# SuperBasic Finance — Database Structure Reference

This file is the map for the SuperBasic Finance database docs.

Use this when you need to know **which** `database-structure-*.md` file to load, instead of dragging the entire schema into context.

The actual schema details (tables, constraints, RLS, SQL) live in the files listed below.

---

## How to use this as an agent

When a task touches the database:

1. **Identify the slice** of the system you’re working on (auth, workspaces, budgets, sync, etc.).
2. **Load only the relevant `database-structure-*.md` files** listed below.
3. If you’re unsure, start with:
   - `database-structure-overview.md` for big-picture layout.
   - `database-structure-rls-and-access-control.md` before touching anything security-sensitive.
   - `database-structure-migrations-ops-and-testing.md` when editing migrations or operational behavior.

The original monolithic doc has been split across the following files. Together they preserve all information and constraints.

---

## File map

### 1. High-level shape and conventions

**File:** `agent/steering/database-structure-overview.md`  
**Use when:** You need the big-picture view of the DB and how pieces fit together.

**Covers:**

- Short product + DB overview (API-first, multi-tenant, append-only ledger).
- Section 1: Tech and Conventions  
  - Postgres + Prisma 6 basics.  
  - UUID PKs, timestamp contract, money column pattern (`amount_cents` + `currency`).  
  - Zero-amount rules, overlays, and the single exception for `budget_envelopes.limit_cents`.  
  - JSONB usage, auth-core tables, RLS GUCs (`app.user_id`, `app.profile_id`, `app.workspace_id`).  
  - Not-null discipline and soft-delete semantics.  
  - ZERO_UUID convention and lowercase email handling.
- Section 2: Core Principles  
  - Append-only ledger, profile-centric domain, workspace collaboration, deterministic uniqueness, observability.
- Section 3: Entity Tree (High-Level)  
  - The full “tree view” of main entities (`users`, `profiles`, `workspaces`, `connections`, `transactions`, `budgets`, etc.) and how they hang together.

---

### 2. Identity, profiles, subscriptions, and API keys

**File:** `agent/steering/database-structure-identity-and-access.md`  
**Use when:** You’re touching auth-core tables, profiles, subscriptions, or personal API keys (PATs).

**Covers:**

- Auth/identity tables (`users`, `user_identities`, `auth_sessions`, `refresh_tokens`, `verification_tokens`, `session_transfer_tokens`, `api_keys`) and their essential fields.
- Token hashing/envelopes for refresh tokens, verification tokens, session transfer tokens, and PATs.
- Profiles:
  - `profiles` table (one profile per user assumption in v1).
  - Timezone, currency, and settings fields.
- Subscriptions:
  - `subscriptions` table structure and linkage to Stripe.
  - Slot limits and status enum.
- API Keys:
  - `api_keys` schema (PATs), `key_hash` JSONB envelope, scopes, ownership rules.
  - Constraint triggers ensuring `profile_id ↔ user_id` alignment and workspace membership checks.
  - Index and partial index strategy for keys.
- Cross-cutting identity constraints:
  - UUID usage, `email_lower` uniqueness, and auth-core alignment requirements.
  - Tests and expectations around hashed tokens and absence of plaintext.

---

### 3. Categories, overrides, and category resolution

**File:** `agent/steering/database-structure-categories-and-resolution.md`  
**Use when:** You’re working on category trees, remap rules, or anything that affects how transactions are categorized.

**Covers:**

- `categories` (system + profile), including:
  - Scoped slugs (`profile_id` NULL vs non-NULL).
  - `deleted_at` soft delete semantics.
  - Parent-child rules and constraint trigger to keep profile scope consistent.
- `profile_category_overrides`:
  - Per-profile remaps, uniqueness rules and soft delete.
- Workspace and view-level category objects:
  - `workspace_categories` (collaborative tree).  
  - `workspace_category_overrides` and `view_category_overrides` schemas.  
  - Source/target pairs, system vs workspace categories, and CHECK constraints enforcing “exactly one of each side”.
- Category resolution order (canonical precedence):
  1. `transaction_overlays.category_id`
  2. `view_category_overrides`
  3. `workspace_category_overrides`
  4. `profile_category_overrides`
  5. `transactions.system_category_id`
- Guidance on using canonical helpers:
  - `effective_transaction_category(...)` for profile-aware views.
  - `effective_workspace_category(...)` for workspace-wide aggregates.
- Index recommendations for overrides and the expectation that **all** resolvers honor the same precedence.

---

### 4. Workspaces, members, and saved views

**File:** `agent/steering/database-structure-workspaces-and-views.md`  
**Use when:** You’re touching shared collaboration, workspace membership, saved views, or link-sharing.

**Covers:**

- `workspaces` table: ownership, settings JSON (including default currency), soft delete rules.
- `workspace_members`:
  - Roles (`owner`, `admin`, `editor`, `viewer`), `scope_json`, membership uniqueness.
  - Role semantics and how app logic + RLS rely on them.
- Saved views:
  - `saved_views` and children: `view_filters`, `view_sorts`, `view_group_by`, `view_rule_overrides`, `view_category_groups`, `view_shares`.
  - Soft delete handling for views and view children.
- Link sharing:
  - `view_links` schema (token/ passcode hashes, `expires_at`, creator).
  - TTL deletion and anonymous link-access behavior (scoped service role + audit logging).
- Account groups:
  - `account_groups` and `account_group_memberships`.
- Workspace-level account access:
  - `workspace_connection_links` (JSONB account-scoped access per connection).
  - `workspace_allowed_accounts` as normalized projection.
  - Invariants between these tables and how RLS uses them.
- Workspace category trees:
  - `workspace_categories` and `workspace_category_overrides` (shared tree vs remaps).

---

### 5. Budgets, envelopes, and budget actuals

**File:** `agent/steering/database-structure-budgets.md`  
**Use when:** You’re modifying or reasoning about the budgeting feature (plans, versions, envelopes, actuals).

**Covers:**

- Conceptual model:
  - Plans and envelopes referenced against categories.
  - How runtime actuals pipeline resolves categories and writes aggregated results.
- Tables:
  - `budget_plans`: workspace binding, `currency`, `rollup_mode`, link to a `saved_view` snapshot, template flag.
  - `budget_versions`: `version_no`, `effective_from/to`, `period`, `carryover_mode`.
  - `budget_envelopes`: `limit_cents`, `warn_at_pct`, optional category linkage, metadata, soft deletes.
  - `budget_actuals`: materialized aggregate table for (plan, version, envelope, period).
- Constraints and refresh behavior:
  - `budget_plans_enforce_currency` and the no-mixed-currency rule.
  - Refresh strategy (nightly + on relevant writes), indexes, and period derivation rules.
  - RLS expectations and why a real table (optionally with a `budget_actuals_mv` view) is used.

---

### 6. Connections, bank accounts, transactions, overlays, and caches

**File:** `agent/steering/database-structure-connections-and-ledger.md`  
**Use when:** You’re working on Plaid/connection ingestion, accounts, core ledger rows, overlays, or performance caches.

**Covers:**

- Connections:
  - `connections` table (owner profile, provider, provider item ID, status, `tx_cursor`, `config` JSONB).
  - Unique provider constraints and where encrypted secrets live.
  - `connection_sponsor_history` as append-only audit of ownership changes.
- Bank accounts:
  - `bank_accounts` schema, uniqueness per connection, `hidden`, `deleted_at`.
  - Composite FK `(id, connection_id)` for transactions.
- Transactions (append-only ledger):
  - `transactions` schema: `account_id`, `connection_id`, `provider_tx_id`, timestamps, `amount_cents` + `currency`, `system_category_id`, `raw_payload`.
  - Constraints: unique `(connection_id, provider_tx_id)`, fallback hash when provider IDs are missing.
  - Triggers that block UPDATE/DELETE (append-only enforcement).
- Overlays and transaction audit:
  - `transaction_overlays`: per-profile overrides, tags, splits JSON, `exclude`, soft deletes.
  - `transaction_audit_log`: event log around transaction changes/sync linkage.
  - `validate_transaction_overlay_splits` trigger ensuring JSON shape and split totals = base amount.
- Performance caches:
  - `user_connection_access_cache` and `profile_transaction_access_cache` schemas.
  - Uniqueness constraints, RLS mirroring, and the fact that both caches are derived and safe to truncate.
- How soft-deleting connections/accounts affects ledger visibility (rows retained for audit, hidden from user traffic via RLS).

---

### 7. Sync sessions, payloads, idempotency, leases, and retention

**File:** `agent/steering/database-structure-sync-and-caches.md`  
**Use when:** You’re working on sync pipelines (Plaid or similar), idempotency, leases, or retention policies for sync payloads.

**Covers:**

- `sync_sessions`: status state machine (`queued`, `running`, `success`, `error`), timestamps, stats JSON.
- Fan-out tables:
  - `session_page_payloads` (large payload pages + TTL).
  - `session_idempotency` (idempotency keys, status, result references).
  - `session_leases` (lease holder + `leased_until`).
  - `sync_audit_log` (events + meta, optional `initiator_profile_id`).
- How syncs interact with `connections` and ultimately surface new `transactions`.
- Retention and TTL:
  - TTL sweeps for `session_page_payloads` and related blobs.
  - Recommended indexes (expiration-based, connection-based).
- Interaction with caches:
  - When and how cache tables are updated or truncated around syncs.
- Guidance for recovering stuck sessions and lease semantics.

---

### 8. Deterministic constraints, indexes, triggers, and SQL snippets

**File:** `agent/steering/database-structure-constraints-indexes-and-triggers.md`  
**Use when:** You’re editing constraints, partial uniques, index strategy, or trigger-based validation.

**Covers:**

- Deterministic uniqueness rules:
  - Full list of required UNIQUE constraints across connections, accounts, transactions, overlays, categories, overrides, views, workspace links, etc.
  - Requirement that partial UNIQUE predicates mirror soft-delete predicates used in RLS.
- Not-null guarantees and soft-delete hygiene:
  - Which FKs, hashes, statuses, and timestamps must be NOT NULL and how CI scripts enforce that.
- Foreign key delete semantics:
  - Guardrail matrix between `ON DELETE RESTRICT` vs `ON DELETE CASCADE` for each parent/child relationship.
- Index strategy:
  - Time-sorted indexes, JSONB GIN, BRIN, and partial indexes for active-only rows.
  - Trade-offs and WAL/latency validation guidance.
- Concrete SQL snippets:
  - Example CREATE INDEX / ALTER TABLE / CHECK constraints mirroring the declarative description (for hand-written migrations).
- Core triggers and helper functions:
  - `prevent_transaction_mutation` (append-only enforcement).
  - `ensure_category_parent_scope`, `ensure_workspace_category_parent_scope`.
  - `validate_workspace_account_scope` for workspace JSON scopes.
  - `validate_transaction_overlay_splits` and associated trigger.

---

### 9. RLS, GUCs, DB roles, and access control

**File:** `agent/steering/database-structure-rls-and-access-control.md`  
**Use when:** You’re touching anything security-related: RLS, roles, context GUCs, or Prisma patterns.

**Covers:**

- RLS approach:
  - How `app.user_id`, `app.profile_id`, `app.workspace_id` are set via `SET LOCAL` at transaction start.
  - Contract that all user traffic goes through a shared `withAppContext` helper using Prisma `$transaction`.
- DB roles:
  - `app_user`, migration role; no separate auth adapter role with BYPASSRLS.
- Policy coverage:
  - Tables where RLS is enabled + forced.
  - Expectations for caches and sync-helper tables under FORCE RLS.
- Prisma runtime contract:
  - Pattern for `withAppContext`, ESlint enforcement of no direct `prisma.<model>` usage outside approved modules.
  - Guidance for PgBouncer/transaction pooling and maintaining GUC scope.
- RLS testing and coverage:
  - pgTAP + Playwright E2E expectations.
  - Smoke test script that asserts no rows are visible without GUCs.
  - RLS coverage queries that verify every RLS-enabled table has policies.
- High-level narrative of canonical CREATE POLICY behavior (detailed SQL lives in the next file).

---

### 10. RLS policies and table-level SQL (full definitions)

**File:** `agent/steering/database-structure-rls-policies-and-ddl.sql.md`  
**Use when:** You need the **exact SQL** for RLS policies, `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY`, and related DDL.

**Covers:**

- Full CREATE POLICY statements for:
  - `connections`, `bank_accounts`, `transactions`, `transaction_overlays`, `transaction_audit_log`.
  - `profiles`, `workspaces`, `workspace_members`, `workspace_connection_links`, `workspace_allowed_accounts`.
  - Category tables and overrides (`categories`, `profile_category_overrides`, `workspace_categories`, `workspace_category_overrides`, `view_category_overrides`).
  - Saved view tables and link tables.
  - Sync tables (`sync_sessions`, `session_page_payloads`, `session_idempotency`, `session_leases`, `sync_audit_log`).
  - Caches (`user_connection_access_cache`, `profile_transaction_access_cache`).
  - `api_keys`, `subscriptions`, budget tables (`budget_plans`, `budget_versions`, `budget_envelopes`, `budget_actuals`).
- All `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` statements for relevant tables.
- SQL definitions for:
  - `workspace_allowed_accounts` table.
  - `workspace_allows_account(...)` helper function.
- This file is intentionally SQL-heavy; use it when you need the **exact** RLS predicates or DDL, not just the narrative.

---

### 11. Tokens, secrets, and security envelopes

**File:** `agent/steering/database-structure-tokens-and-secrets.md`  
**Use when:** You’re designing or updating token formats, hashing, or storage of provider secrets.

**Covers:**

- Canonical token envelope:
  - `<token_id>.<token_secret>` pattern.
  - JSONB hash structure: `{ "algo": "hmac-sha256", "key_id": "v1", "hash": "<base64>" }`.
- One-way hashes:
  - `api_keys.key_hash`, `refresh_tokens.hash_envelope`, `verification_tokens.hash_envelope`, `session_transfer_tokens.hash_envelope`, `view_links.token_hash`, `view_links.passcode_hash`.
- Token hashing rules:
  - No plaintext tokens or passcodes stored.
  - Only `token_id` in plaintext; `token_secret` always hashed with HMAC-SHA-256 + server-side key and optional salt.
- Encrypted secrets:
  - Where Plaid access tokens and similar live (encrypted at rest).
  - Boundary for logging and application code (never log decrypted values).
- Verification + regression tests:
  - Expected unit + integration coverage to ensure hashes and rotation behavior work as designed.
- Sessions:
  - Guidance for JWT vs DB-backed sessions and their interaction with hashed tokens.

---

### 12. Migrations, data integrity, ops, and testing

**File:** `agent/steering/database-structure-migrations-ops-and-testing.md`  
**Use when:** You’re modifying migrations, writing new SQL, planning retention/TTL jobs, or validating production readiness.

**Covers:**

- Data integrity and retention:
  - Append-only contracts, soft delete behavior, TTL sweeps for sync payloads, session/verification token cleanup, GDPR deletion flows.
  - Behavior for revoked Plaid items / deleted connections.
- Migrations and environments:
  - Use of Prisma Migrate with Neon branches (dev/preview/prod).
  - Seeding for system categories and default workspace trees (and RLS bypass rules during seeding).
  - Policy that DDL (triggers, BRIN, partial indexes) live in SQL migrations and must mirror this doc.
- Budget actuals computation notes (high-level, with details in `database-structure-budgets.md`).
- Testing and operational hardening:
  - RLS verification checklists (pgTAP, E2E, smoke tests, schema drift detection).
  - Deferrable constraints + trigger validation, append-only enforcement tests.
  - Neon plan validation and index/plan snapshot tests.
  - Budget invariants and category resolver parity tests.
- Ready-for-prod checklist:
  - UUIDs everywhere, money fields, mandatory hashes, GIN + partial indexes, RLS wired with `SET LOCAL`, seeds, and E2Es.
- Neon ops notes:
  - WAL pressure, archiving heavy payloads, vacuum/branch storage considerations.
  - When to consider partitions for `transactions`.
  - Monitoring `pg_stat_statements` for RLS-heavy queries.
- Lifecycle jobs:
  - Nightly TTL sweeps for sessions, tokens, links, sync payloads.
  - Cron/QStash jobs for denormalizations and budget refreshes.
  - Requirements for maintenance roles and audit logging.

---

## Choosing the right file (quick matrix)

- **General DB shape / what table lives where?**  
  → `database-structure-overview.md`

- **Auth-core tables, profiles, subscriptions, PATs?**  
  → `database-structure-identity-and-access.md`  
  → `database-structure-tokens-and-secrets.md` (for token details)

- **Categories, remaps, how category resolution works?**  
  → `database-structure-categories-and-resolution.md`

- **Workspaces, memberships, saved views, view links?**  
  → `database-structure-workspaces-and-views.md`

- **Budgets / envelopes / budget_actuals?**  
  → `database-structure-budgets.md`

- **Connections, accounts, core ledger, overlays, cache tables?**  
  → `database-structure-connections-and-ledger.md`

- **Sync sessions, page payloads, idempotency, leases, retention?**  
  → `database-structure-sync-and-caches.md`

- **Indexes, uniques, foreign-key semantics, triggers and example SQL?**  
  → `database-structure-constraints-indexes-and-triggers.md`

- **RLS, Prisma context helpers, policies, DB roles?**  
  → `database-structure-rls-and-access-control.md`  
  → `database-structure-rls-policies-and-ddl.sql.md` (for raw SQL)

- **Tokens, secrets, encryption, HMAC envelopes?**  
  → `database-structure-tokens-and-secrets.md`

- **Migrations, data retention, TTL jobs, prod readiness, Neon ops?**  
  → `database-structure-migrations-ops-and-testing.md`


---

<!-- source: steering/database/database-structure-rls-and-access-control.md -->

# Database Structure — RLS and Access Control

This file documents how we do access control in the database:

- The session context (GUCs) used by RLS
- Which tables have RLS and how FORCE RLS is used
- How the application must talk to Postgres (Prisma contract)
- The separation between `auth_service`, `app_user`, and maintenance roles
- Performance guidance for RLS-heavy queries

For the actual `CREATE POLICY` and `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` DDL, see:

- `database-structure-rls-policies-and-ddl.sql.md`

For constraints and indexes that support RLS predicates, see:

- `database-structure-constraints-indexes-and-triggers.md`

---

## 1. Session Context via GUCs

Every request that touches user data must set three Postgres GUCs:

- `app.user_id` — `users.id`
- `app.profile_id` — `profiles.id`
- `app.workspace_id` — `workspaces.id` or `NULL` (for profile-only flows)

Contract:

- At request start, in a single DB session/transaction, the app executes:

    SET LOCAL app.user_id = '<users.id>';
    SET LOCAL app.profile_id = '<profiles.id>';
    SET LOCAL app.workspace_id = '<workspaces.id or NULL>';

- These GUCs are used by all RLS policies as the primary identity source.
- If a GUC is missing or NULL:
  - Policies treat the caller as not authenticated for that dimension and deny access.

Background jobs:

- Default to clearing all three GUCs:

    SET LOCAL app.user_id     = NULL;
    SET LOCAL app.profile_id  = NULL;
    SET LOCAL app.workspace_id = NULL;

- Jobs that intentionally impersonate a profile/workspace:
  - Explicitly set the GUCs.
  - Must log impersonation metadata for audit.

---

## 2. Application Contract (Prisma + withAppContext)

All user-facing DB access must go through a single helper, conceptually:

- Pseudo-code:

    async function withAppContext(ids, fn) {
      return prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'SET LOCAL app.user_id = $1, app.profile_id = $2, app.workspace_id = $3',
          ids.userId,
          ids.profileId,
          ids.workspaceId,
        );
        return fn(tx);
      });
    }

- Requirements:

  - Every request runs inside `prisma.$transaction(async (tx) => { ... })`.
    - Interactive transactions are disabled.
  - The **first** call in the transaction sets the GUCs via `SET LOCAL`.
  - All subsequent queries for that request must:
    - Use the transactional `tx` handle only.
    - Never touch the root `prisma` client directly.

- Violations:

  - Direct `prisma.<model>` calls outside the helper are considered bugs.
  - Enforced via:
    - ESLint rules (e.g., custom rule or `eslint-plugin-boundaries`).
    - Optional runtime guard using `AsyncLocalStorage`:
      - If `prisma` is touched outside an active context, throw.

PgBouncer compatibility:

- If PgBouncer transaction pooling is introduced:

  - Pattern stays the same:
    - Start transaction.
    - `SET LOCAL` GUCs.
    - Run queries.
    - Commit/rollback.
  - CI should include tests with PgBouncer enabled (e.g. `PGBOUNCER=true pnpm test ...`) to confirm:
    - `SET LOCAL` sticks for the lifetime of each transaction.

Background jobs:

- Jobs that do **not** act on behalf of a user:
  - Must explicitly clear GUCs (set to NULL) at the start.
- Jobs that impersonate:
  - Must set GUCs intentionally and be rare, auditable paths.

---

## 3. Tables Under RLS and FORCE RLS

RLS is enabled and forced for all user-facing application tables, plus internal caches; auth-core tables follow the same GUC-based context and are not bypassed.

RLS is enabled/forced on:

- Identity and ownership:

  - `profiles`
  - `workspaces`
  - `workspace_members`
  - `subscriptions`
  - `api_keys`

- Categories and overrides:

  - `categories`
  - `profile_category_overrides`
  - `workspace_categories`
  - `workspace_category_overrides`
  - `view_category_overrides`

- Workspaces and sharing:

  - `saved_views`
  - `view_filters`
  - `view_sorts`
  - `view_group_by`
  - `view_rule_overrides`
  - `view_category_groups`
  - `view_shares`
  - `view_links`
  - `workspace_connection_links`
  - `workspace_allowed_accounts`

- Ledger:

  - `connections`
  - `bank_accounts`
  - `transactions`
  - `transaction_overlays`
  - `transaction_audit_log`

- Sync + audit:

  - `sync_sessions`
  - `session_page_payloads`
  - `session_idempotency`
  - `session_leases`
  - `sync_audit_log`

- Caches:

  - `user_connection_access_cache`
  - `profile_transaction_access_cache`

- Budgets:

  - `budget_plans`
  - `budget_versions`
  - `budget_envelopes`
  - `budget_actuals`

Auth-core tables follow the same GUC-based context and RLS approach; no separate adapter role or BYPASSRLS is used.

For the exact `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` and `FORCE ROW LEVEL SECURITY` statements, see:

- `database-structure-rls-policies-and-ddl.sql.md`

---

## 4. Policy Shape (High-Level Semantics)

The concrete `CREATE POLICY` definitions live in the SQL file, but they follow consistent rules:

- Soft-delete awareness:

  - All policies filter out soft-deleted rows:
    - `deleted_at IS NULL` or `revoked_at IS NULL`, etc.
  - This is aligned with partial indexes and uniqueness predicates.

- Ownership + membership:

  - Profiles:

    - `profiles_self_rw`:
      - A profile can read and update only its own row (`id = app.profile_id`).

  - Workspaces:

    - `workspaces_membership_access`:
      - A profile can see a workspace if:
        - They are the `owner_profile_id`, or
        - They have a `workspace_members` row.
      - Write checks require ownership.

  - Workspace members:

    - `workspace_members_rw`:
      - Members can see their own membership rows.
      - Only owners/admins can alter membership.

  - Subscriptions:

    - `subscriptions_owner`:
      - A profile sees and updates only its own subscription row.

- Ledger access (connections, bank_accounts, transactions):

  - Ownership rule:

    - If `connections.owner_profile_id = app.profile_id`, the profile:
      - Sees and may write its own connection and bank accounts (subject to soft-delete).
      - Sees its transactions, with append-only rules enforced.

  - Workspace rule (for members):

    - If `app.workspace_id` is non-NULL and the profile is a workspace member for that workspace:

      - The profile can see connections and accounts when:
        - `workspace_allowed_accounts` grants access to the account, or
        - `workspace_connection_links` grants access (optionally scoped by `account_scope_json` and `expires_at`).

      - Transaction visibility requires:
        - The account is allowed under the workspace, and
        - The connection is active (not soft-deleted).

- Overlays and categories:

  - Overlays:

    - `transaction_overlays_self`:
      - A profile can read/write *only* its own overlays (`profile_id = app.profile_id`).
      - Additionally, the profile must be allowed to see the underlying transaction.

  - Categories:

    - `categories_profile_scope`:
      - A profile sees:
        - System categories (`profile_id IS NULL`).
        - Its own categories.
      - Write checks ensure:
        - Only a profile can modify its own categories (system categories seeded by maintenance roles).

    - `profile_category_overrides_self`:
      - Profile-level overrides are scoped by `profile_id = app.profile_id`.

    - `workspace_categories_membership` and `workspace_category_overrides_membership`:
      - Access restricted to workspace members.
      - Writes restricted to owners/admins (or admins/editors depending on the policy).

    - `view_category_overrides_membership`:
      - Per-view overrides accessible to members of the view’s workspace.
      - Writes reserved for owner/admin/editor roles.

- Views and sharing:

  - `saved_views_membership` and policies on `view_filters`, `view_sorts`, `view_group_by`, `view_rule_overrides`, `view_category_groups`, `view_shares`, `view_links`:

    - Ensure:
      - Only workspace members can see views and their config.
      - Only appropriate roles (owner/admin/editor) can modify them.
      - Link management is restricted to higher-privilege members (owner/admin for `view_links`).

- Caches:

  - `user_connection_cache_policy`:

    - A profile only sees cache entries where:
      - `profile_id = app.profile_id`, and
      - `workspace_id IS NULL` or `workspace_id = app.workspace_id`.

  - `profile_transaction_cache_policy`:

    - Same pattern, but scoped to transactions.

- Budgets:

  - `budget_plans_membership`, `budget_versions_membership`, `budget_envelopes_membership`:

    - Visibility:
      - Workspace members can see budget structures for their workspace.
    - Writes:
      - Only owners/admins (and sometimes editors, depending on policy) can mutate budget structures.

  - `budget_actuals_membership`:

    - Ensures:
      - Only workspace members can see aggregated actuals for plans in their workspace.

For exact SQL, refer to `database-structure-rls-policies-and-ddl.sql.md`.

---

## 5. Caches and Internal Tables

Caches:

- `user_connection_access_cache`
- `profile_transaction_access_cache`

Key points:

- Access only through backend services.
- `FORCE ROW LEVEL SECURITY` enabled to ensure:
  - Caches cannot bypass access control.
- Policies mirror the same predicates as their source tables (connections, accounts, transactions, workspaces).
- Because entries are derived from deterministic queries, they can be safely truncated to recover from bugs or drift.

Sync helpers:

- Tables like `transaction_audit_log`, `sync_sessions`, `session_page_payloads`, `session_idempotency`, `session_leases`, `sync_audit_log`:

  - Are written by `app_user` under RLS.
  - Policies use `WITH CHECK` clauses to ensure:
    - Inserts/updates succeed only when the caller already satisfies the visibility predicates (e.g., owner or workspace member).

---

## 6. Performance Hygiene with RLS

Because RLS predicates run on every query, we keep them predictable and index-friendly:

- Design principles:

  - Keep predicates simple and AND-oriented:
    - Avoid complex OR trees that kill index usage.
  - Align predicates with indexes:
    - Fields used in policies (e.g., `workspace_id`, `member_profile_id`, `deleted_at`, `revoked_at`, `expires_at`) must have matching indexes.
  - Prefer precomputed paths for heavy workloads:
    - For dashboards/exports, consider joining against the precomputed cache tables instead of recomputing access checks per row.

- Query plan validation:

  - Regularly run `EXPLAIN (ANALYZE, BUFFERS)` in a staging/Neon preview environment with RLS enabled to ensure:
    - Index scans on hot tables (`transactions`, `workspace_allowed_accounts`, etc.).
    - No unexpected full-table scans.

  - Store representative plans under something like `tooling/plans/...` and validate with:
    - `tooling/scripts/validate-plans.ts`
    - Gated by `pnpm db:plan-validate` in CI.

- Example hot-path workloads to validate:

  - Transaction feeds filtered by workspace/profile/date (`transactions` joined to `bank_accounts` and workspace scopes).
  - Budget aggregation via `budget_actuals`.
  - Connection and bank account listings with workspace scoping.
  - Sync session and audit history queries (`sync_sessions`, `sync_audit_log`, `session_page_payloads`).

If policy changes worsen plans, CI should fail, forcing a review.

---

## 7. Database Roles

We use distinct roles for separation of concerns:

- `migration` / `schema` role:

  - Owns schemas/tables.
  - Runs all DDL (migrations, extension installs).
  - Has privileges to create/alter/drop objects.

- `app_user`:

  - Dedicated application role.
  - **No** `SUPERUSER` or `BYPASSRLS`.
  - Granted only minimal:

    - `CONNECT` on DB.
    - `USAGE` on relevant schemas.
    - `SELECT/INSERT/UPDATE/DELETE` on application tables, within RLS.

  - Cannot modify RLS policies or schema.

- `maintenance_user` (optional):

  - Used for maintenance/TTL jobs.
  - May bypass RLS only where documented (e.g., for TTL sweeps).
  - Runs carefully audited scripts (e.g., GDPR deletion, TTL cleanup, cache truncation).

Extensions:

- Enabled via the migration role:

  - `pgcrypto` (UUID/tokens).
  - `btree_gist` (exclusion indexes).
  - Optional `pg_trgm` for search.

---

## 8. RLS Coverage and Testing

We treat RLS coverage as a first-class invariant.

Checklist (implemented via scripts/tests described in `database-structure-migrations-ops-and-testing.md`):

- Coverage query:

  - Ensure there are no tables with `rowsecurity = true` but no policies:

        SELECT tab.relname
        FROM pg_class tab
        JOIN pg_namespace ns ON ns.oid = tab.relnamespace
        WHERE relkind = 'r' AND pg_has_role(tab.relowner, 'USAGE')
          AND tab.rowsecurity = true
        EXCEPT
        SELECT polrelid::regclass::text
        FROM pg_policies;

  - Must return zero rows before deploy.
  - Similar checks for `FORCE RLS`.

- Smoke tests:

  - A `rls-smoke` script connects as `app_user` with no GUCs set and executes:

        SELECT 1 FROM <table> LIMIT 1;

    across all RLS-enabled tables, expecting zero visible rows.

- pgTAP tests (Phase 2):

  - Fixture profiles:
    - Owners, admins, editors, viewers, unaffiliated profiles, and anonymous callers.
  - For each role:
    - Run SELECT/INSERT/UPDATE/DELETE on key tables.
    - Expect:

      - Successes for allowed paths.
      - `ERROR: new row violates row-level security policy` for denied paths.

- E2E tests:

  - Playwright or equivalent tests the main flows (dashboards, overlays, budgets, sharing, view links) under each role plus link-based access.
  - Confirm:
    - SDK/API handle denied responses gracefully.

## 9. When Changing RLS Policies

If you add or modify RLS policies:

1. Update `database-structure-rls-policies-and-ddl.sql.md` with the exact SQL.  
2. Update this file to describe new semantics at a high level.  
3. Update any affected per-area schema docs (workspaces, budgets, ledger, etc.).  
4. Run and extend:

   - RLS coverage and smoke tests.
   - Query plan validation (for hot workloads).
   - E2E tests for affected flows.

RLS is the core security boundary for multi-tenant data. Any change to it must be treated as a security-sensitive migration, with documentation and tests kept tightly in sync.


---

<!-- source: steering/database/database-structure-rls-policies-and-ddl.sql.md -->

# Database Structure — RLS Policies and DDL (SQL Reference)

This file is the canonical SQL reference for:

- All `CREATE POLICY` statements (RLS)
- RLS `WITH CHECK` clauses
- `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY` statements

Comments and high-level semantics are documented in:

- `database-structure-rls-and-access-control.md`

This file is meant as a copy-pastable reference for migrations and schema verification.

---

## 1. RLS Policies (CREATE POLICY)

    CREATE POLICY connections_rw ON connections
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND deleted_at IS NULL
        AND (
          owner_profile_id = current_setting('app.profile_id', true)::uuid
          OR (
            current_setting('app.workspace_id', true) IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM workspace_members wm
              WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
            )
            AND EXISTS (
              SELECT 1
              FROM bank_accounts ba
              WHERE ba.connection_id = connections.id
                AND ba.deleted_at IS NULL
                AND (
                  EXISTS (
                    SELECT 1
                    FROM workspace_allowed_accounts waa
                    WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND waa.bank_account_id = ba.id
                      AND waa.revoked_at IS NULL
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM workspace_connection_links wcl
                    WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND wcl.revoked_at IS NULL
                      AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
                      AND (
                        wcl.account_scope_json IS NULL
                        OR ba.id::text IN (
                          SELECT jsonb_array_elements_text(wcl.account_scope_json)
                        )
                      )
                  )
                )
            )
          )
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND deleted_at IS NULL
        AND owner_profile_id = current_setting('app.profile_id', true)::uuid
      );

    CREATE POLICY workspace_members_rw ON workspace_members
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND (
          member_profile_id = current_setting('app.profile_id', true)::uuid
          OR EXISTS (
            SELECT 1
            FROM workspace_members wm_admin
            WHERE wm_admin.workspace_id = workspace_members.workspace_id
              AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
              AND wm_admin.role IN ('owner', 'admin')
          )
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm_admin
          WHERE wm_admin.workspace_id = workspace_members.workspace_id
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin')
        )
      );

    CREATE POLICY workspace_connection_links_access ON workspace_connection_links
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND current_setting('app.workspace_id', true) IS NOT NULL
        AND workspace_id = current_setting('app.workspace_id', true)::uuid
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm
          WHERE wm.workspace_id = workspace_connection_links.workspace_id
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND current_setting('app.workspace_id', true) IS NOT NULL
        AND workspace_id = current_setting('app.workspace_id', true)::uuid
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm_admin
          WHERE wm_admin.workspace_id = workspace_connection_links.workspace_id
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin')
        )
      );

    CREATE POLICY workspace_allowed_accounts_access ON workspace_allowed_accounts
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND current_setting('app.workspace_id', true) IS NOT NULL
        AND workspace_id = current_setting('app.workspace_id', true)::uuid
        AND revoked_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm
          WHERE wm.workspace_id = workspace_allowed_accounts.workspace_id
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND current_setting('app.workspace_id', true) IS NOT NULL
        AND workspace_id = current_setting('app.workspace_id', true)::uuid
        AND revoked_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm_admin
          WHERE wm_admin.workspace_id = workspace_allowed_accounts.workspace_id
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin')
        )
      );

    CREATE POLICY bank_accounts_rw ON bank_accounts
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM connections c
          WHERE c.id = bank_accounts.connection_id
            AND c.deleted_at IS NULL
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
                AND (
                  EXISTS (
                    SELECT 1
                    FROM workspace_allowed_accounts waa
                    WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND waa.bank_account_id = bank_accounts.id
                      AND waa.revoked_at IS NULL
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM workspace_connection_links wcl
                    WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND wcl.revoked_at IS NULL
                      AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
                      AND (
                        wcl.account_scope_json IS NULL
                        OR bank_accounts.id::text IN (
                          SELECT jsonb_array_elements_text(wcl.account_scope_json)
                        )
                      )
                  )
                )
              )
            )
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM connections c
          WHERE c.id = bank_accounts.connection_id
            AND c.owner_profile_id = current_setting('app.profile_id', true)::uuid
            AND c.deleted_at IS NULL
        )
      );

    CREATE POLICY transactions_owner_insert ON transactions
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM connections c
          WHERE c.id = transactions.connection_id
            AND current_setting('app.profile_id', true) IS NOT NULL
            AND c.deleted_at IS NULL
            AND c.owner_profile_id = current_setting('app.profile_id', true)::uuid
        )
      );

    CREATE POLICY transactions_access ON transactions
      FOR SELECT
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND (
          EXISTS (
            SELECT 1
            FROM connections c
            JOIN bank_accounts ba ON ba.id = transactions.account_id
            WHERE c.id = transactions.connection_id
              AND c.owner_profile_id = current_setting('app.profile_id', true)::uuid
          )
          OR (
            current_setting('app.workspace_id', true) IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM workspace_members wm
              WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
            )
            AND (
              EXISTS (
                SELECT 1
                FROM workspace_allowed_accounts waa
                WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
                  AND waa.bank_account_id = transactions.account_id
                  AND waa.revoked_at IS NULL
              )
              OR EXISTS (
                SELECT 1
                FROM workspace_connection_links wcl
                WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
                  AND wcl.revoked_at IS NULL
                  AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
                  AND (
                    wcl.account_scope_json IS NULL
                    OR transactions.account_id::text IN (
                      SELECT jsonb_array_elements_text(wcl.account_scope_json)
                    )
                  )
              )
            )
          )
        )
      );
    -- No UPDATE/DELETE policies are defined; transactions stay append-only for app_user.

    CREATE POLICY transaction_overlays_self ON transaction_overlays
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND deleted_at IS NULL
        AND profile_id = current_setting('app.profile_id', true)::uuid
        AND EXISTS (
          SELECT 1
          FROM transactions t
          JOIN connections c ON c.id = t.connection_id
          JOIN bank_accounts ba ON ba.id = t.account_id
          WHERE t.id = transaction_overlays.transaction_id
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
                AND (
                  EXISTS (
                    SELECT 1
                    FROM workspace_allowed_accounts waa
                    WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND waa.bank_account_id = t.account_id
                      AND waa.revoked_at IS NULL
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM workspace_connection_links wcl
                    WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND wcl.revoked_at IS NULL
                      AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
                      AND (
                        wcl.account_scope_json IS NULL
                        OR t.account_id::text IN (
                          SELECT jsonb_array_elements_text(wcl.account_scope_json)
                        )
                      )
                  )
                )
              )
            )
        )
      )
      WITH CHECK (
        profile_id = current_setting('app.profile_id', true)::uuid
        AND EXISTS (
          SELECT 1
          FROM transactions t
          JOIN connections c ON c.id = t.connection_id
          JOIN bank_accounts ba ON ba.id = t.account_id
          WHERE t.id = transaction_overlays.transaction_id
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
                AND (
                  EXISTS (
                    SELECT 1
                    FROM workspace_allowed_accounts waa
                    WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND waa.bank_account_id = t.account_id
                      AND waa.revoked_at IS NULL
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM workspace_connection_links wcl
                    WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND wcl.revoked_at IS NULL
                      AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
                      AND (
                        wcl.account_scope_json IS NULL
                        OR t.account_id::text IN (
                          SELECT jsonb_array_elements_text(wcl.account_scope_json)
                        )
                      )
                  )
                )
              )
            )
        )
      );

    CREATE POLICY user_connection_cache_policy ON user_connection_access_cache
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND profile_id = current_setting('app.profile_id', true)::uuid
        AND (
          workspace_id IS NULL
          OR workspace_id = current_setting('app.workspace_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND profile_id = current_setting('app.profile_id', true)::uuid
        AND (
          workspace_id IS NULL
          OR workspace_id = current_setting('app.workspace_id', true)::uuid
        )
      );

    CREATE POLICY profile_transaction_cache_policy ON profile_transaction_access_cache
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND profile_id = current_setting('app.profile_id', true)::uuid
        AND (
          workspace_id IS NULL
          OR workspace_id = current_setting('app.workspace_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND profile_id = current_setting('app.profile_id', true)::uuid
        AND (
          workspace_id IS NULL
          OR workspace_id = current_setting('app.workspace_id', true)::uuid
        )
      );

    CREATE POLICY profiles_self_rw ON profiles
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND id = current_setting('app.profile_id', true)::uuid
      )
      WITH CHECK (
        id = current_setting('app.profile_id', true)::uuid
      );

    CREATE POLICY workspaces_membership_access ON workspaces
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND (
          owner_profile_id = current_setting('app.profile_id', true)::uuid
          OR EXISTS (
            SELECT 1
            FROM workspace_members wm
            WHERE wm.workspace_id = workspaces.id
              AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
          )
        )
        AND workspaces.deleted_at IS NULL
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND owner_profile_id = current_setting('app.profile_id', true)::uuid
        AND workspaces.deleted_at IS NULL
      );

    CREATE POLICY categories_profile_scope ON categories
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND (
          profile_id IS NULL
          OR profile_id = current_setting('app.profile_id', true)::uuid
        )
        AND deleted_at IS NULL
      )
      WITH CHECK (
        profile_id = current_setting('app.profile_id', true)::uuid
        AND deleted_at IS NULL
      );

    CREATE POLICY profile_category_overrides_self ON profile_category_overrides
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND profile_id = current_setting('app.profile_id', true)::uuid
      )
      WITH CHECK (
        profile_id = current_setting('app.profile_id', true)::uuid
      );

    CREATE POLICY workspace_categories_membership ON workspace_categories
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND current_setting('app.workspace_id', true) IS NOT NULL
        AND workspace_id = current_setting('app.workspace_id', true)::uuid
        AND deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm
          WHERE wm.workspace_id = workspace_categories.workspace_id
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND current_setting('app.workspace_id', true) IS NOT NULL
        AND workspace_id = current_setting('app.workspace_id', true)::uuid
        AND deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm_admin
          WHERE wm_admin.workspace_id = workspace_categories.workspace_id
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin')
        )
      );

    CREATE POLICY workspace_category_overrides_membership ON workspace_category_overrides
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND current_setting('app.workspace_id', true) IS NOT NULL
        AND workspace_id = current_setting('app.workspace_id', true)::uuid
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm
          WHERE wm.workspace_id = workspace_category_overrides.workspace_id
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND current_setting('app.workspace_id', true) IS NOT NULL
        AND workspace_id = current_setting('app.workspace_id', true)::uuid
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm_admin
          WHERE wm_admin.workspace_id = workspace_category_overrides.workspace_id
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin')
        )
      );

    CREATE POLICY view_category_overrides_membership ON view_category_overrides
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND view_category_overrides.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
          WHERE sv.id = view_category_overrides.view_id
            AND sv.deleted_at IS NULL
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND view_category_overrides.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
          WHERE sv.id = view_category_overrides.view_id
            AND sv.deleted_at IS NULL
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin', 'editor')
        )
      );

    CREATE POLICY saved_views_membership ON saved_views
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm
          WHERE wm.workspace_id = saved_views.workspace_id
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
        AND saved_views.deleted_at IS NULL
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm_admin
          WHERE wm_admin.workspace_id = saved_views.workspace_id
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin', 'editor')
        )
        AND saved_views.deleted_at IS NULL
      );

    CREATE POLICY view_filters_membership ON view_filters
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
          WHERE sv.id = view_filters.view_id
            AND sv.deleted_at IS NULL
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
          WHERE sv.id = view_filters.view_id
            AND sv.deleted_at IS NULL
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin', 'editor')
        )
      );

    CREATE POLICY view_sorts_membership ON view_sorts
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
          WHERE sv.id = view_sorts.view_id
            AND sv.deleted_at IS NULL
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
          WHERE sv.id = view_sorts.view_id
            AND sv.deleted_at IS NULL
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin', 'editor')
        )
      );

    CREATE POLICY view_group_by_membership ON view_group_by
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
          WHERE sv.id = view_group_by.view_id
            AND sv.deleted_at IS NULL
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
          WHERE sv.id = view_group_by.view_id
            AND sv.deleted_at IS NULL
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin', 'editor')
        )
      );

    CREATE POLICY view_rule_overrides_membership ON view_rule_overrides
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
          WHERE sv.id = view_rule_overrides.view_id
            AND sv.deleted_at IS NULL
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
          WHERE sv.id = view_rule_overrides.view_id
            AND sv.deleted_at IS NULL
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin', 'editor')
        )
      );

    CREATE POLICY view_category_groups_membership ON view_category_groups
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
          WHERE sv.id = view_category_groups.view_id
            AND sv.deleted_at IS NULL
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
          WHERE sv.id = view_category_groups.view_id
            AND sv.deleted_at IS NULL
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin', 'editor')
        )
      );

    CREATE POLICY view_shares_membership ON view_shares
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
          WHERE sv.id = view_shares.view_id
            AND sv.deleted_at IS NULL
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
          WHERE sv.id = view_shares.view_id
            AND sv.deleted_at IS NULL
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin', 'editor')
        )
      );

    CREATE POLICY view_links_membership ON view_links
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
          WHERE sv.id = view_links.view_id
            AND sv.deleted_at IS NULL
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
          WHERE sv.id = view_links.view_id
            AND sv.deleted_at IS NULL
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin')
        )
      );

    CREATE POLICY transaction_audit_log_access ON transaction_audit_log
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM transactions t
          JOIN connections c ON c.id = t.connection_id
          JOIN bank_accounts ba ON ba.id = t.account_id
          WHERE t.id = transaction_audit_log.transaction_id
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
                AND (
                  EXISTS (
                    SELECT 1
                    FROM workspace_allowed_accounts waa
                    WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND waa.bank_account_id = ba.id
                      AND waa.revoked_at IS NULL
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM workspace_connection_links wcl
                    WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND wcl.revoked_at IS NULL
                      AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
                      AND (
                        wcl.account_scope_json IS NULL
                        OR ba.id::text IN (
                          SELECT jsonb_array_elements_text(wcl.account_scope_json)
                        )
                      )
                  )
                )
              )
            )
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM transactions t
          JOIN connections c ON c.id = t.connection_id
          JOIN bank_accounts ba ON ba.id = t.account_id
          WHERE t.id = transaction_audit_log.transaction_id
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
                AND (
                  EXISTS (
                    SELECT 1
                    FROM workspace_allowed_accounts waa
                    WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND waa.bank_account_id = ba.id
                      AND waa.revoked_at IS NULL
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM workspace_connection_links wcl
                    WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND wcl.revoked_at IS NULL
                      AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
                      AND (
                        wcl.account_scope_json IS NULL
                        OR ba.id::text IN (
                          SELECT jsonb_array_elements_text(wcl.account_scope_json)
                        )
                      )
                  )
                )
              )
            )
        )
      );

    CREATE POLICY sync_sessions_access ON sync_sessions
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM connections c
          WHERE c.id = sync_sessions.connection_id
            AND c.deleted_at IS NULL
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
              )
            )
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM connections c
          WHERE c.id = sync_sessions.connection_id
            AND c.deleted_at IS NULL
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
              )
            )
        )
      );

    CREATE POLICY session_page_payloads_access ON session_page_payloads
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM sync_sessions ss
          JOIN connections c ON c.id = ss.connection_id
          WHERE ss.id = session_page_payloads.sync_session_id
            AND c.deleted_at IS NULL
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
              )
            )
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM sync_sessions ss
          JOIN connections c ON c.id = ss.connection_id
          WHERE ss.id = session_page_payloads.sync_session_id
            AND c.deleted_at IS NULL
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
              )
            )
        )
      );

    CREATE POLICY session_idempotency_access ON session_idempotency
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM sync_sessions ss
          JOIN connections c ON c.id = ss.connection_id
          WHERE ss.id = session_idempotency.sync_session_id
            AND c.deleted_at IS NULL
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
              )
            )
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM sync_sessions ss
          JOIN connections c ON c.id = ss.connection_id
          WHERE ss.id = session_idempotency.sync_session_id
            AND c.deleted_at IS NULL
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
              )
            )
        )
      );

    CREATE POLICY session_leases_access ON session_leases
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM sync_sessions ss
          JOIN connections c ON c.id = ss.connection_id
          WHERE ss.id = session_leases.sync_session_id
            AND c.deleted_at IS NULL
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
              )
            )
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM sync_sessions ss
          JOIN connections c ON c.id = ss.connection_id
          WHERE ss.id = session_leases.sync_session_id
            AND c.deleted_at IS NULL
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
              )
            )
        )
      );

    CREATE POLICY sync_audit_log_access ON sync_audit_log
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND (
          initiator_profile_id = current_setting('app.profile_id', true)::uuid
          OR EXISTS (
            SELECT 1
            FROM connections c
            WHERE c.id = sync_audit_log.connection_id
              AND c.deleted_at IS NULL
              AND (
                c.owner_profile_id = current_setting('app.profile_id', true)::uuid
                OR (
                  current_setting('app.workspace_id', true) IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                    FROM workspace_members wm
                    WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                  )
                )
              )
          )
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND (
          initiator_profile_id = current_setting('app.profile_id', true)::uuid
          OR EXISTS (
            SELECT 1
            FROM connections c
            WHERE c.id = sync_audit_log.connection_id
              AND c.deleted_at IS NULL
              AND (
                c.owner_profile_id = current_setting('app.profile_id', true)::uuid
                OR (
                  current_setting('app.workspace_id', true) IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                    FROM workspace_members wm
                    WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                  )
                )
              )
          )
        )
      );

    CREATE POLICY api_keys_self ON api_keys
      USING (
        current_setting('app.user_id', true) IS NOT NULL
        AND user_id = current_setting('app.user_id', true)::uuid
      )
      WITH CHECK (
        user_id = current_setting('app.user_id', true)::uuid
      );

    CREATE POLICY subscriptions_owner ON subscriptions
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND profile_id = current_setting('app.profile_id', true)::uuid
      )
      WITH CHECK (
        profile_id = current_setting('app.profile_id', true)::uuid
      );

    CREATE POLICY budget_plans_membership ON budget_plans
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm
          WHERE wm.workspace_id = budget_plans.workspace_id
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
        AND budget_plans.deleted_at IS NULL
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm_admin
          WHERE wm_admin.workspace_id = budget_plans.workspace_id
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin')
        )
        AND budget_plans.deleted_at IS NULL
      );

    CREATE POLICY budget_versions_membership ON budget_versions
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM budget_plans bp
          JOIN workspace_members wm ON wm.workspace_id = bp.workspace_id
          WHERE bp.id = budget_versions.plan_id
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND bp.deleted_at IS NULL
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM budget_plans bp
          JOIN workspace_members wm_admin ON wm_admin.workspace_id = bp.workspace_id
          WHERE bp.id = budget_versions.plan_id
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin')
            AND bp.deleted_at IS NULL
        )
      );

    CREATE POLICY budget_envelopes_membership ON budget_envelopes
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM budget_versions bv
          JOIN budget_plans bp ON bp.id = bv.plan_id
          JOIN workspace_members wm ON wm.workspace_id = bp.workspace_id
          WHERE bv.id = budget_envelopes.version_id
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND bp.deleted_at IS NULL
        )
        AND budget_envelopes.deleted_at IS NULL
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM budget_versions bv
          JOIN budget_plans bp ON bp.id = bv.plan_id
          JOIN workspace_members wm_admin ON wm_admin.workspace_id = bp.workspace_id
          WHERE bv.id = budget_envelopes.version_id
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin')
            AND bp.deleted_at IS NULL
        )
        AND budget_envelopes.deleted_at IS NULL
      );

    CREATE POLICY budget_actuals_membership ON budget_actuals
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM budget_plans bp
          JOIN workspace_members wm ON wm.workspace_id = bp.workspace_id
          WHERE bp.id = budget_actuals.plan_id
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND bp.deleted_at IS NULL
        )
      );

---

## 2. Enable and Force RLS (ALTER TABLE)

These statements ensure RLS is enabled and forced on all user-facing and cache tables.

    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE profiles FORCE ROW LEVEL SECURITY;

    ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
    ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;

    ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
    ALTER TABLE workspace_members FORCE ROW LEVEL SECURITY;

    ALTER TABLE workspace_connection_links ENABLE ROW LEVEL SECURITY;
    ALTER TABLE workspace_connection_links FORCE ROW LEVEL SECURITY;

    ALTER TABLE workspace_allowed_accounts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE workspace_allowed_accounts FORCE ROW LEVEL SECURITY;

    ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
    ALTER TABLE categories FORCE ROW LEVEL SECURITY;

    ALTER TABLE profile_category_overrides ENABLE ROW LEVEL SECURITY;
    ALTER TABLE profile_category_overrides FORCE ROW LEVEL SECURITY;

    ALTER TABLE workspace_categories ENABLE ROW LEVEL SECURITY;
    ALTER TABLE workspace_categories FORCE ROW LEVEL SECURITY;

    ALTER TABLE workspace_category_overrides ENABLE ROW LEVEL SECURITY;
    ALTER TABLE workspace_category_overrides FORCE ROW LEVEL SECURITY;

    ALTER TABLE view_category_overrides ENABLE ROW LEVEL SECURITY;
    ALTER TABLE view_category_overrides FORCE ROW LEVEL SECURITY;

    ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;
    ALTER TABLE saved_views FORCE ROW LEVEL SECURITY;

    ALTER TABLE view_filters ENABLE ROW LEVEL SECURITY;
    ALTER TABLE view_filters FORCE ROW LEVEL SECURITY;

    ALTER TABLE view_sorts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE view_sorts FORCE ROW LEVEL SECURITY;

    ALTER TABLE view_group_by ENABLE ROW LEVEL SECURITY;
    ALTER TABLE view_group_by FORCE ROW LEVEL SECURITY;

    ALTER TABLE view_rule_overrides ENABLE ROW LEVEL SECURITY;
    ALTER TABLE view_rule_overrides FORCE ROW LEVEL SECURITY;

    ALTER TABLE view_category_groups ENABLE ROW LEVEL SECURITY;
    ALTER TABLE view_category_groups FORCE ROW LEVEL SECURITY;

    ALTER TABLE view_shares ENABLE ROW LEVEL SECURITY;
    ALTER TABLE view_shares FORCE ROW LEVEL SECURITY;

    ALTER TABLE view_links ENABLE ROW LEVEL SECURITY;
    ALTER TABLE view_links FORCE ROW LEVEL SECURITY;

    ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
    ALTER TABLE connections FORCE ROW LEVEL SECURITY;

    ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE bank_accounts FORCE ROW LEVEL SECURITY;

    ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE transactions FORCE ROW LEVEL SECURITY;

    ALTER TABLE transaction_overlays ENABLE ROW LEVEL SECURITY;
    ALTER TABLE transaction_overlays FORCE ROW LEVEL SECURITY;

    ALTER TABLE transaction_audit_log ENABLE ROW LEVEL SECURITY;
    ALTER TABLE transaction_audit_log FORCE ROW LEVEL SECURITY;

    ALTER TABLE sync_sessions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sync_sessions FORCE ROW LEVEL SECURITY;

    ALTER TABLE session_page_payloads ENABLE ROW LEVEL SECURITY;
    ALTER TABLE session_page_payloads FORCE ROW LEVEL SECURITY;

    ALTER TABLE session_idempotency ENABLE ROW LEVEL SECURITY;
    ALTER TABLE session_idempotency FORCE ROW LEVEL SECURITY;

    ALTER TABLE session_leases ENABLE ROW LEVEL SECURITY;
    ALTER TABLE session_leases FORCE ROW LEVEL SECURITY;

    ALTER TABLE sync_audit_log ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sync_audit_log FORCE ROW LEVEL SECURITY;

    ALTER TABLE user_connection_access_cache ENABLE ROW LEVEL SECURITY;
    ALTER TABLE user_connection_access_cache FORCE ROW LEVEL SECURITY;

    ALTER TABLE profile_transaction_access_cache ENABLE ROW LEVEL SECURITY;
    ALTER TABLE profile_transaction_access_cache FORCE ROW LEVEL SECURITY;

    ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
    ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;

    ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;

    ALTER TABLE budget_plans ENABLE ROW LEVEL SECURITY;
    ALTER TABLE budget_plans FORCE ROW LEVEL SECURITY;

    ALTER TABLE budget_versions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE budget_versions FORCE ROW LEVEL SECURITY;

    ALTER TABLE budget_envelopes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE budget_envelopes FORCE ROW LEVEL SECURITY;

    ALTER TABLE budget_actuals ENABLE ROW LEVEL SECURITY;
    ALTER TABLE budget_actuals FORCE ROW LEVEL SECURITY;


---

<!-- source: steering/database/database-structure-sql-helpers-and-triggers.sql.md -->

# Database Structure — SQL Helpers, Triggers, and Workspace Allowed Accounts

This file contains the canonical SQL for:

- `workspace_allowed_accounts` table (projection of JSON scopes)
- Helper function `workspace_allows_account(...)`
- Append-only enforcement on `transactions`
- Category tree scope enforcement
- Workspace category parent scope enforcement
- Validation of `workspace_connection_links.account_scope_json`
- Validation of `transaction_overlays.splits`

These definitions back the higher-level contracts described in:

- `database-structure-constraints-indexes-and-triggers.md`
- `database-structure-rls-and-access-control.md`
- `database-structure-ledger-and-sync.md`
- `database-structure-workspaces-and-collaboration.md`

Use this file when authoring or reviewing migrations.

---

## 1. Workspace Allowed Accounts (DDL + Helper)

`workspace_allowed_accounts` is a normalized projection of `workspace_connection_links.account_scope_json`.

- **Source of truth** remains the JSON scopes on `workspace_connection_links`.
- This table is regenerated by background jobs or migrations.
- Do **not** mutate it independently.

Table DDL:

    CREATE TABLE IF NOT EXISTS workspace_allowed_accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      bank_account_id uuid NOT NULL REFERENCES bank_accounts(id),
      granted_by_profile_id uuid NOT NULL REFERENCES profiles(id),
      revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, bank_account_id) WHERE revoked_at IS NULL
    );

Convenience helper (application-level; not used directly inside RLS after predicates were inlined):

    CREATE OR REPLACE FUNCTION workspace_allows_account(workspace uuid, bank_account uuid)
    RETURNS boolean AS $$
      -- Application-level convenience helper (not used inside RLS after inlining).
      -- Never call it from policies on workspace_allowed_accounts or workspace_connection_links
      -- to avoid recursive evaluation.
      --
      -- Callers must align the workspace argument with their current auth context so
      -- EXISTS predicates stay selective.
      SELECT
        EXISTS (
          SELECT 1
          FROM workspace_allowed_accounts waa
          WHERE waa.workspace_id = workspace
            AND waa.bank_account_id = bank_account
            AND waa.revoked_at IS NULL
        )
        OR EXISTS (
          SELECT 1
          FROM workspace_connection_links wcl
          WHERE wcl.workspace_id = workspace
            AND wcl.revoked_at IS NULL
            AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
            AND (
              wcl.account_scope_json IS NULL
              OR bank_account::text IN (
                   SELECT jsonb_array_elements_text(wcl.account_scope_json)
                 )
            )
        );
    $$ LANGUAGE sql STABLE;

    -- Runs as SECURITY INVOKER so the app role stays behind FORCE RLS; ensure policies above
    -- permit the necessary SELECT checks. If future use cases require bypassing RLS, flip to
    -- SECURITY DEFINER and harden search_path/role grants to prevent privilege escalation.
    --
    -- Performance note: consider pre-joining in long-running reports instead of chaining this
    -- helper inside deep RLS predicates.

---

## 2. Append-Only Enforcement for Transactions

`transactions` must be strictly append-only for `app_user`. We enforce this via triggers that reject UPDATE/DELETE.

Function:

    CREATE OR REPLACE FUNCTION prevent_transaction_mutation()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'transactions are append-only';
    END;
    $$ LANGUAGE plpgsql;

Triggers:

    CREATE TRIGGER transactions_no_update
      BEFORE UPDATE ON transactions
      FOR EACH ROW
      EXECUTE FUNCTION prevent_transaction_mutation();

    CREATE TRIGGER transactions_no_delete
      BEFORE DELETE ON transactions
      FOR EACH ROW
      EXECUTE FUNCTION prevent_transaction_mutation();

---

## 3. Category Tree Parent Scope Enforcement

System/profile category trees must be internally consistent:

- System categories (`profile_id IS NULL`) can only parent system nodes.
- Profile-owned categories can only parent categories for the same profile.

Function:

    CREATE OR REPLACE FUNCTION ensure_category_parent_scope()
    RETURNS trigger AS $$
    DECLARE
      parent_profile uuid;
    BEGIN
      IF NEW.parent_id IS NULL THEN
        RETURN NEW;
      END IF;

      SELECT profile_id
      INTO parent_profile
      FROM categories
      WHERE id = NEW.parent_id;

      IF (parent_profile IS DISTINCT FROM NEW.profile_id) THEN
        RAISE EXCEPTION
          'category parent must share profile scope (both NULL for system categories)';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

Constraint trigger (deferrable to allow bulk updates):

    CREATE CONSTRAINT TRIGGER categories_parent_scope_ck
      AFTER INSERT OR UPDATE ON categories
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION ensure_category_parent_scope();

---

## 4. Workspace Category Parent Scope Enforcement

Workspace category trees must not cross workspaces:

- A workspace category’s parent must belong to the same workspace.

Function:

    CREATE OR REPLACE FUNCTION ensure_workspace_category_parent_scope()
    RETURNS trigger AS $$
    DECLARE
      parent_workspace uuid;
    BEGIN
      IF NEW.parent_id IS NULL THEN
        RETURN NEW;
      END IF;

      SELECT workspace_id
      INTO parent_workspace
      FROM workspace_categories
      WHERE id = NEW.parent_id;

      IF parent_workspace IS DISTINCT FROM NEW.workspace_id THEN
        RAISE EXCEPTION
          'workspace category parent must belong to same workspace';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

Constraint trigger (deferrable):

    CREATE CONSTRAINT TRIGGER workspace_categories_parent_scope_ck
      AFTER INSERT OR UPDATE ON workspace_categories
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION ensure_workspace_category_parent_scope();

---

## 5. Validation of workspace_connection_links.account_scope_json

`workspace_connection_links.account_scope_json` is a JSONB array of account UUID strings used to scope connections to a subset of accounts.

Validation requirements:

- If non-NULL:
  - Must be a JSON array.
  - Each element must be a UUID string.
  - Each referenced account must:
    - Belong to the given `connection_id`.
    - Be non-deleted (`deleted_at IS NULL`).

Function:

    CREATE OR REPLACE FUNCTION validate_workspace_account_scope()
    RETURNS trigger AS $$
    DECLARE
      account_id uuid;
    BEGIN
      IF NEW.account_scope_json IS NULL THEN
        RETURN NEW;
      END IF;

      IF jsonb_typeof(NEW.account_scope_json) <> 'array' THEN
        RAISE EXCEPTION 'account_scope_json must be array of UUID strings';
      END IF;

      FOR account_id IN
        SELECT jsonb_array_elements_text(NEW.account_scope_json)::uuid
      LOOP
        IF NOT EXISTS (
          SELECT 1
          FROM bank_accounts ba
          WHERE ba.id = account_id
            AND ba.connection_id = NEW.connection_id
            AND ba.deleted_at IS NULL
        ) THEN
          RAISE EXCEPTION
            'account_scope_json contains account % that is not part of connection %',
            account_id, NEW.connection_id;
        END IF;
      END LOOP;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

Constraint trigger (deferrable):

    CREATE CONSTRAINT TRIGGER workspace_connection_links_scope_ck
      AFTER INSERT OR UPDATE ON workspace_connection_links
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION validate_workspace_account_scope();

---

## 6. Validation of transaction_overlays.splits

`transaction_overlays.splits` holds structured split metadata and must satisfy:

- If non-NULL, the value must be a JSON array.
- Each element must be a JSON object containing `amount_cents`.
- The sum of `amount_cents` across all splits must equal the base transaction’s `amount_cents`.

Function:

    CREATE OR REPLACE FUNCTION validate_transaction_overlay_splits()
    RETURNS trigger AS $$
    DECLARE
      split_record jsonb;
      total bigint := 0;
      base_amount bigint;
    BEGIN
      IF NEW.splits IS NULL OR jsonb_typeof(NEW.splits) <> 'array' THEN
        IF NEW.splits IS NOT NULL THEN
          RAISE EXCEPTION 'splits must be a JSON array';
        END IF;
        RETURN NEW;
      END IF;

      FOR split_record IN
        SELECT jsonb_array_elements(NEW.splits)
      LOOP
        IF jsonb_typeof(split_record) <> 'object'
           OR NOT split_record ? 'amount_cents' THEN
          RAISE EXCEPTION 'each split must include amount_cents';
        END IF;

        total := total + (split_record ->> 'amount_cents')::bigint;
      END LOOP;

      SELECT amount_cents
      INTO base_amount
      FROM transactions
      WHERE id = NEW.transaction_id;

      IF base_amount IS NULL THEN
        RAISE EXCEPTION 'transaction not found for overlay';
      END IF;

      IF total <> base_amount THEN
        RAISE EXCEPTION
          'split totals (%s) must equal transaction amount (%s)',
          total, base_amount;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

Trigger:

    CREATE TRIGGER transaction_overlays_splits_validate
      BEFORE INSERT OR UPDATE ON transaction_overlays
      FOR EACH ROW
      EXECUTE FUNCTION validate_transaction_overlay_splits();

---

These helpers and triggers should be kept in lockstep with:

- The declarative constraints and indexes in `database-structure-constraints-indexes-and-triggers.md`.
- The RLS policies that rely on consistent workspace/account/category semantics.

When changing any of them, update:

1. This file (SQL reference).  
2. The corresponding narrative docs.  
3. Migration scripts and tests that depend on the behavior.


---

<!-- source: steering/database/database-structure-sync-and-caches.md -->

# Database Structure — Sync, Audit, and Access Caches

This file covers:

- Sync sessions and related fan-out tables:
  - `sync_sessions`
  - `session_page_payloads`
  - `session_idempotency`
  - `session_leases`
  - `sync_audit_log`
- How sync integrates with the ledger (`transactions`, `connections`, `bank_accounts`)
- Performance/authorization caches:
  - `user_connection_access_cache`
  - `profile_transaction_access_cache`
- Lifecycle and TTL behavior for sync payloads and caches

Use this when you’re working on ingestion/sync pipelines, background workers, or any code that needs to reason about access caches.

For ledger tables:
- See `database-structure-connections-and-ledger.md`.

For workspace access graph and allowed accounts:
- See `database-structure-workspaces-and-views.md`.

For RLS policies and SQL:
- See `database-structure-rls-and-access-control.md` and `database-structure-rls-policies-and-ddl.sql.md`.

---

## 1. Sync Sessions and Audit

Sync runs **per connection** and fans out into several tables. The goal is to:

- Pull data from providers reliably and idempotently.
- Track progress and failure for each sync run.
- Store large provider payloads temporarily (not forever).
- Enforce single-worker processing via leases.
- Maintain an audit trail.

### 1.1 sync_sessions

Table: `sync_sessions`

Purpose:

- Represents a single synchronization run for a connection.

Core columns:

- `id` — UUID PK.
- `connection_id` — FK to `connections(id)` NOT NULL.
- `initiator_profile_id` — FK to `profiles(id)` NOT NULL:
  - Profile that initiated the sync (e.g., user action or system profile).
- `status` — TEXT with CHECK:
  - `CHECK (status IN ('queued','running','success','error'))`
  - Status transitions:
    - `queued → running → success` or `queued → running → error`.
- `started_at` — TIMESTAMPTZ:
  - Time worker started processing the session.
- `ended_at` — TIMESTAMPTZ NULL:
  - Completion time (success or error).
- `stats` — JSONB:
  - Aggregated metrics about the run (e.g. counts of inserted/updated transactions, pages processed).
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Semantics:

- One session per sync run; retried syncs create a new row.
- A session must complete or be marked `error` before a new one for the same connection is scheduled, unless a lease expires (see below).
- Connection-level logic uses `sync_sessions` to:
  - Drive incremental syncs (`connections.tx_cursor`).
  - Debug provider issues via `stats`.

Indexes:

- Recommend index on `(connection_id, started_at DESC)` to support:
  - “Last sync” queries.
  - Paging through historical syncs.

RLS:

- Visibility is limited to:
  - The connection owner, and
  - Members of workspaces that have access to the connection (see access graph).
- See `sync_sessions_access` policy in the RLS SQL file.

---

### 1.2 session_page_payloads

Table: `session_page_payloads`

Purpose:

- Store per-page provider payloads for a given sync session.
- Designed for large, transient blobs that are useful for debugging but should not live forever.

Core columns:

- `id` — UUID PK.
- `sync_session_id` — FK to `sync_sessions(id)` NOT NULL.
- `page_no` — INT NOT NULL:
  - Page index within the sync session (0-based or 1-based; app-defined but must be consistent).
- `payload` — JSONB NOT NULL:
  - Provider response payload for that page.
- `expires_at` — TIMESTAMPTZ NOT NULL:
  - Time after which the payload can be safely deleted.
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Indexes:

- Partial index on `(expires_at)`:
  - Efficient TTL sweeps:
    - Delete rows where `expires_at <= now()`.

Lifecycle:

- TTL job:
  - Periodically deletes expired payload rows (and associated blobs, if stored elsewhere).
  - This keeps the table from growing unbounded.
- Payload retention window:
  - Typically 30–90 days (configurable at the job level).

RLS:

- Mirrors `sync_sessions` visibility:
  - Must ensure only authorized profiles see payloads tied to connections they can access.

---

### 1.3 session_idempotency

Table: `session_idempotency`

Purpose:

- Ensure idempotent processing of actions within a sync session (e.g., page-level or command-level idempotency keys).

Core columns:

- `id` — UUID PK.
- `sync_session_id` — FK to `sync_sessions(id)` NOT NULL.
- `idempotency_key` — TEXT NOT NULL UNIQUE:
  - Key representing a particular idempotent operation (e.g., `sync-page-<page_no>`).
- `status` — TEXT NOT NULL:
  - Status of the idempotent operation.
  - Allowed values are defined at the application layer (e.g. `'pending'`, `'completed'`, `'failed'`).
- `result_ref` — TEXT NULL:
  - Optional reference to stored results or another table for the outcome.
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Semantics:

- On processing an idempotent operation:
  - Worker first checks for an existing `idempotency_key`.
  - If present and completed, it reuses the recorded outcome.
  - If not, it creates a new row and updates status once the operation finishes.
- This table is crucial for:
  - Safe retries.
  - Protecting against duplicate provider callbacks or at-least-once tasks.

RLS:

- Access is scoped via `sync_sessions` and their underlying `connections`.
- See `session_idempotency_access` policy.

---

### 1.4 session_leases

Table: `session_leases`

Purpose:

- Enforce single-worker processing for each sync_session.
- Allow safe takeover if a worker dies or hangs.

Core columns:

- `id` — UUID PK.
- `sync_session_id` — FK to `sync_sessions(id)` NOT NULL.
- `leased_until` — TIMESTAMPTZ NOT NULL:
  - Time until which the current holder owns the lease.
- `holder` — TEXT NOT NULL:
  - Identifier for the worker/process (e.g. hostname or worker ID).
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Semantics:

- Worker behavior:
  - Claims a lease by inserting or updating a row with:
    - `leased_until = now() + lease_duration`
    - `holder = <worker-id>`
  - Periodically extends the lease while making progress.
- Takeover:
  - If `leased_until` has passed without completion:
    - New worker may claim the lease.
    - Prior work is considered abandoned.
    - The existing `sync_sessions.status` should transition accordingly (e.g. to `'error'` or a retried state).
- Recovering stuck sessions:
  - If a session’s lease expires and status is not `success` or `error`:
    - Mark the session as `'error'` (or schedule a new session for retry).
    - New session runs with a fresh lease.

RLS:

- Restricted to maintenance roles and backend services.
- User-facing traffic typically does not interact with this table directly.
- See `session_leases_access` policy.

---

### 1.5 sync_audit_log

Table: `sync_audit_log`

Purpose:

- Append-only audit log for sync operations across connections and sessions.

Core columns:

- `id` — UUID PK.
- `connection_id` — FK to `connections(id)` NOT NULL.
- `sync_session_id` — FK to `sync_sessions(id)` NULL:
  - Optional; some events may not be tied to a specific session.
- `initiator_profile_id` — FK to `profiles(id)` NULL:
  - Profile that initiated the event when user-driven.
  - NULL for system or worker events.
- `event` — TEXT NOT NULL:
  - Event type (e.g. `"sync_started"`, `"sync_completed"`, `"sync_failed"`, `"cursor_updated"`).
- `meta` — JSONB NOT NULL:
  - Structured metadata (error codes, counts, provider messages, context).
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.

Semantics:

- Provides a durable audit trail for:
  - Sync results.
  - Manual admin operations.
  - Incident and debugging traces.
- `initiator_profile_id`:
  - Set when a user explicitly triggers sync.
  - NULL when the event is system/cron/worker initiated.

RLS:

- Visibility is restricted to:
  - Connection owners.
  - Workspace members for connections they can access.
- See `sync_audit_log_access` policy.

---

## 2. Integration with the Ledger

Sync interacts with the ledger (see `database-structure-connections-and-ledger.md`):

- Each `sync_session` belongs to a `connection`.
- During a session:
  - Provider pages are stored in `session_page_payloads`.
  - New `transactions` are inserted (append-only).
  - `connections.tx_cursor` is updated for incremental syncs.
  - `transaction_audit_log` rows are written for key events.

Flows:

1. A sync is queued for `connection_id`.
2. Worker claims a lease via `session_leases`.
3. Worker updates `sync_sessions.status` to `'running'`.
4. For each provider page:
   - Insert a row into `session_page_payloads` (with a TTL).
   - Insert/update relevant ledger rows (append-only for `transactions`).
   - Log events in `transaction_audit_log` and `sync_audit_log`.
5. On success:
   - Update `sync_sessions.status` to `'success'`.
   - Set `ended_at`.
6. On error:
   - Update `sync_sessions.status` to `'error'`.
   - Log error details in `sync_audit_log`.
   - Release or expire the lease so future workers can retry.

Visibility:

- As soon as transactions are written:
  - They surface to:
    - The connection owner, and
    - Any workspaces with active `workspace_connection_links` or `workspace_allowed_accounts` for the affected accounts.
- RLS ensures:
  - Only authorized profiles see those transactions.

---

## 3. Performance / Authorization Caches

Two optional caches accelerate repeated access checks and hot-path queries:

- `user_connection_access_cache`
- `profile_transaction_access_cache`

They are **derived** from deterministic queries and can be safely truncated when invalidated.

### 3.1 user_connection_access_cache

Table: `user_connection_access_cache`

Purpose:

- Cache per-profile/per-connection/per-workspace access decisions and visible account scopes.
- Reduce cost of repeatedly recomputing workspace/connection/account predicates.

Core columns:

- `profile_id` — UUID NOT NULL:
  - Profile making the request.
- `connection_id` — UUID NOT NULL:
  - Connection for which access is cached.
- `workspace_id` — UUID NULL:
  - Workspace context:
    - NULL → cache entry across all workspaces (profile-only context).
    - Non-NULL → cache entry specific to a workspace.
- `account_scope_json` — JSONB:
  - Cached account scope:
    - Could mirror `workspace_connection_links.account_scope_json` or a computed intersection.
- `user_id` — UUID NULL:
  - Optional `users.id` for audit/debug only.
  - All actual access control keys off `profile_id` and `workspace_id`.
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Indexes and uniqueness:

- GIN index on `account_scope_json` (where beneficial).
- Uniqueness constraint:

  - `UNIQUE (
       profile_id,
       connection_id,
       COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid)
     )`

  - Uses ZERO_UUID shorthand for NULL workspace_id to enforce a single cache row per (profile, connection, workspace-scope).

Semantics:

- These entries are computed by backend services, not by user traffic directly.
- They are “just a cache”:
  - If truncated, the system recomputes them on demand.
- They must always reflect the same semantics as the underlying RLS and access graph.

RLS:

- Protected via FORCE RLS.
- Policy (`user_connection_cache_policy`) ensures:
  - A profile sees only cache entries where:
    - `profile_id = current_setting('app.profile_id')`, and
    - `workspace_id IS NULL` or matches `app.workspace_id`.

---

### 3.2 profile_transaction_access_cache

Table: `profile_transaction_access_cache`

Purpose:

- Cache per-transaction access decisions for a profile (and optionally a workspace).
- Used for high-volume transaction feeds and analytics where RLS access checks would otherwise be expensive per row.

Core columns:

- `transaction_id` — UUID NOT NULL.
- `profile_id` — UUID NOT NULL.
- `workspace_id` — UUID NULL:
  - NULL → profile-wide (all-workspace) access.
  - Non-NULL → workspace-specific access.
- `connection_id` — UUID NOT NULL.
- `account_id` — UUID NOT NULL.
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Uniqueness:

- `UNIQUE (
     transaction_id,
     profile_id,
     COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid)
   )`

  - ZERO_UUID is used again as a sentinel for NULL workspace_id.

Semantics:

- Each row asserts:
  - “This profile has access to this transaction, optionally in this workspace context.”
- Derived from:
  - Workspace membership.
  - Workspace connection links and allowed accounts.
  - Connection ownership rules.
- When underlying access graph changes (membership, links, revocations):
  - Cache entries must be invalidated and recomputed.

RLS:

- Mirrors transaction visibility:
  - A profile can only see rows where:
    - `profile_id = current_setting('app.profile_id')`.
    - `workspace_id` is NULL or equals `current_setting('app.workspace_id')`.
- See `profile_transaction_cache_policy`.

---

### 3.3 Cache lifecycle and invalidation

Both caches share these properties:

- Derived from deterministic queries:
  - Safe to truncate entirely if necessary (e.g., maintenance or migration).
- Invalidation events:
  - Changes to:
    - workspace_members,
    - workspace_connection_links,
    - workspace_allowed_accounts,
    - connections.status / deleted_at,
    - bank_accounts.deleted_at,
    - relevant RLS policies.
  - This should trigger:
    - Cache invalidation for affected profiles/connections/workspaces, or
    - A global refresh for more invasive changes.
- RLS:
  - FORCE RLS is enabled to ensure:
    - Application only sees rows allowed by the same predicates as the primary tables.
    - Even caches cannot be used to bypass access control.

---

## 4. Lifecycle Jobs (Sync and Caches)

Lifecycle jobs are described more fully in the operational hardening file, but the sync/caches aspects are:

- TTL sweeps:
  - `session_page_payloads`:
    - Delete rows where `expires_at <= now()`.
  - `sessions`, `verification_tokens`, `view_links`, `workspace_connection_links`:
    - Similar TTL logic on `expires_at` and/or revoked/expired markers.
- Denormalization:
  - Nightly or frequent jobs update:
    - `workspace_allowed_accounts` from `workspace_connection_links.account_scope_json`.
- Cache management:
  - Jobs may periodically:
    - Truncate or prune `user_connection_access_cache` and `profile_transaction_access_cache`.
    - Rebuild caches for hot profiles/workspaces.
- Roles:
  - These jobs run under a dedicated `maintenance_user` role (or similar) that:
    - Sets GUCs (`app.profile_id`, `app.workspace_id`) to NULL.
    - Has the necessary privileges to delete rows and bypass RLS only where explicitly documented.
- Ordering and transactions:
  - Cleanup scripts must obey FK order:
    - For example, purge child payload rows (`session_page_payloads`, session-related blobs) before deleting parent `sync_sessions`.

Observability:

- Each TTL and cache job should emit:
  - Structured logs (rows deleted, duration).
  - Metrics for alerting when:
    - Jobs fail.
    - They delete zero rows over multiple runs (possible scheduling issues or RLS misconfiguration).

---

## 5. Summary of Responsibilities

- `sync_sessions`:
  - High-level unit of sync per connection (status, timing, stats).
- `session_page_payloads`:
  - Temporary storage of provider payload pages with TTL.
- `session_idempotency`:
  - Per-session idempotency keys to guard against duplicate processing.
- `session_leases`:
  - Single-worker processing and takeover for stuck sessions.
- `sync_audit_log`:
  - Durable log of sync events across connections/sessions.

- `user_connection_access_cache`:
  - Cache of per-profile/per-connection/per-workspace access and scope.
- `profile_transaction_access_cache`:
  - Cache of per-transaction access for profiles, optionally per workspace.

All of these structures are subordinate to:

- The canonical ledger (`connections`, `bank_accounts`, `transactions`).
- The workspace access graph (`workspace_connection_links`, `workspace_allowed_accounts`, `workspace_members`).
- RLS policies based on GUCs (`app.user_id`, `app.profile_id`, `app.workspace_id`).

When changing sync or cache behavior, always:

1. Consider impacts on RLS and access control.  
2. Update this file and the RLS/constraints docs to reflect any new semantics.  
3. Ensure TTL and maintenance jobs are still valid and safe under FORCE RLS.


---

<!-- source: steering/database/database-structure-tokens-and-secrets.md -->

# Database Structure — Tokens, Hashes, and Provider Secrets

This file defines how we handle all token-like values and provider secrets:

- Canonical token shape and storage format
- Which columns store one-way hashes
- How token hashing and verification work
- How provider credentials are encrypted
- Testing and regression expectations
- Session token handling

Use this whenever you touch:

- API keys
- View links / passcodes
- DB-backed sessions and verification tokens
- Provider access tokens (Plaid, webhooks, processor tokens)

---

## 1. Canonical Token Envelope

**Rule 0: Never store plaintext tokens or passcodes.**

All generated tokens follow the same logical envelope:

- Format: `"<token_id>.<token_secret>"`
  - `token_id`:
    - UUID v4.
    - Stored in plaintext columns (e.g. `*_id`, `token_id`) for lookups.
  - `token_secret`:
    - Opaque secret string; **never** stored in plaintext.

- All `*_hash` columns store a structured JSONB envelope, e.g.:

      {
        "algo": "hmac-sha256",
        "key_id": "v1",
        "hash": "<base64>"
      }

  - `algo` — algorithm identifier (currently `"hmac-sha256"`).
  - `key_id` — which server-side key was used; supports key rotation.
  - `hash` — base64-encoded HMAC digest of `token_secret` (with per-token salt).

- Column DDL must use `JSONB` (not `TEXT`) so we can:
  - Query into metadata.
  - Filter by algorithm or key_id during rotations.

- Token generator helpers must also record:
  - `issued_at`
  - Optional salt metadata
  inside the JSON payload when future rotation or debugging requires it.

---

## 2. One-Way Hash Columns

These columns store **hash envelopes**, never plaintext:

- `api_keys.key_hash`
  - Stores HMAC digest of the API key secret, plus metadata.
- `view_links.token_hash`
- `view_links.passcode_hash`
  - Shared format + metadata (algo, key_id, etc.).
- `sessions.session_token_hash` (when sessions are DB-backed).
- `verification_tokens.token_hash`
  - Shared hash envelope for passwordless / verification flows.

If you add a new token-bearing table, it must:

1. Use `<token_id>.<token_secret>` as the logical token.
2. Store `token_id` plaintext, `token_secret` only in a JSONB hash envelope.
3. Include algorithm, key_id, and any rotation metadata in that JSONB.

---

## 3. Token Hashing & Verification

Shared rules for all token-like secrets:

- Representation:
  - Application-level token: `"<token_id>.<token_secret>"`.
  - DB-level:
    - Plaintext `token_id` (UUID).
    - JSONB `*_hash` column containing the HMAC envelope.

- Hashing:

  - `token_secret` is hashed via HMAC-SHA-256 with:
    - A server-side key.
    - Per-token salt (embedded in the JSON metadata if needed).

  - The hash envelope is stored as JSONB, e.g.:

        {
          "algo": "hmac-sha256",
          "key_id": "v1",
          "hash": "<base64-hmac>",
          "issued_at": "...",
          "salt": "..."
        }

- Verification:

  - Application parses the presented token into:
    - `token_id`, `token_secret`.
  - Looks up DB row by `token_id`.
  - Recomputes HMAC using:
    - stored `key_id` and associated server-side key.
    - Any salt/parameters in the JSON.
  - Compares the recomputed digest to `hash` using a **constant-time** comparison:
    - `timingSafeEqual` (or equivalent in the language runtime).
  - Result:
    - Match → token valid (subject to expiry/revocation checks).
    - No match → token invalid.

- Display/handling:

  - Tokens are shown exactly once (on creation).
  - After that:
    - Only `token_id` and its hash envelope remain.
    - Lost tokens cannot be recovered; callers must regenerate new ones.

---

## 4. Encrypted Provider Secrets (Non-Hashed)

**Important distinction:**

- Tokens that must be **verified** only (API keys, view links, sessions, verification tokens) use **one-way hashing**.
- Provider credentials that must be **reused** (for outbound API calls) use **encryption**, not hashing.

Provider credentials include:

- Plaid access tokens
- Plaid processor tokens
- Webhook signing secrets
- Any other third-party credentials required for API calls

Rules:

- Provider credentials must be encrypted at rest using:
  - Application-level KMS helpers (e.g. cloud KMS or envelope encryption).
- Storage options:
  - Encrypted fields inside `connections.config` **or**
  - A dedicated `connection_secrets`-style table.
- They must **never** be:
  - Hashed (we need to decrypt them to call providers).
  - Logged in plaintext.
  - Persisted in plaintext outside the encryption boundary.

For Plaid:

- Access tokens stay decryptable for Plaid API calls.
- Never log token values (even partially).
- Ensure logs and `pg_stat_activity` never contain raw access tokens.

---

## 5. Verification & Regression Tests

Tests must confirm token handling remains safe and non-leaky.

Recommended coverage:

- **Unit tests:**

  - Verify that:
    - Revoked tokens fail verification.
    - Expired tokens fail verification.
    - Constant-time comparison wrappers are used:
      - Ensure normal equality operators are never used on hashed secrets.

- **Integration tests (auth + view link flows):**

  - Exercise:
    - API key creation and verification.
    - View link issuance and consumption.
    - DB-backed session creation and validation.
    - Verification token workflows (magic links, email verification).

  - Assertions:
    - No plaintext token segments appear in:
      - Application logs.
      - `pg_stat_activity` (`query` column).
    - Only hash envelopes and non-identifying metadata are logged (if anything).

- **Rotation tests:**

  - Mint tokens under an *old* `key_id`.
  - Rotate to a *new* key:
    - Stored tokens still verify correctly using old key metadata.
    - Newly created tokens pick up the latest `algo` + `key_id`.
  - Confirm:
    - The JSONB envelope structure supports mixed key versions.
    - No callers rely on hard-coded algorithm/keys.

---

## 6. Session Tokens

Session behavior depends on session mode:

- **JWT sessions:**

  - Prefer avoiding DB lookups entirely.
  - Sessions validated purely via JWT:
    - Signed using server keys.
    - Subject to expiry embedded in the token.
  - No session token storage in the DB.

- **DB-backed sessions:**

  - Use the same token envelope rules:
    - Session token presented to clients is `"<token_id>.<token_secret>"`.
    - DB stores:
      - `token_id` (via `id` or dedicated column).
      - `sessions.session_token_hash` JSONB envelope (HMAC of token_secret).
  - Never store:
    - `sessionToken` plaintext.
    - Any raw secret segments inside the `sessions` row.

  - Additional constraints:
    - `sessions.session_token_hash` is `UNIQUE`.
    - `expires` is indexed for TTL sweeps.

---

## 7. When Adding New Token Types

If you introduce a new token-bearing feature (e.g., invite tokens, export tokens):

1. Use the canonical `"<token_id>.<token_secret>"` format.  
2. Store `token_id` in plaintext; persist only a JSONB `*_hash` envelope for `token_secret`.  
3. Include `algo`, `key_id`, and any salt/issued_at metadata.  
4. Add unit tests verifying:
   - Constant-time comparison.
   - Revocation/expiry behavior.
5. Add integration tests ensuring:
   - No plaintext token segments appear in logs or `pg_stat_activity`.  
6. Update:
   - This file (schema/contract for the new token).
   - `database-structure-constraints-indexes-and-triggers.md` (if you add constraints/indexes).
   - `database-structure-migrations-ops-and-testing.md` (if you add migrations or ops flows).

This keeps token semantics uniform across the system and prevents accidental secrets leakage.


---

<!-- source: steering/database/database-structure-workspaces-and-views.md -->

# Database Structure — Workspaces, Members, Views, and Workspace-Scoped Access

This file covers:

- Workspaces (collaboration units)
- Workspace members and role semantics
- Saved views and their child tables
- View sharing and public link access
- Account groups
- Workspace connection links and allowed accounts (access graph)
- Workspace categories (collaborative tree)
- Workspace category overrides (workspace-level remaps, resolution-side)

Use this whenever you’re touching collaboration, workspace-scoped access, or any UI that depends on saved views and category remaps.

For:

- Category semantics and resolution → see database-structure-categories-and-resolution.md  
- RLS policies and SQL → see database-structure-rls-and-access-control.md and database-structure-rls-policies-and-ddl.sql.md  

---

## 1. Workspaces

Table: workspaces

Purpose:

- Collaborative container for financial data and budgets.
- A workspace is owned by a profile but can have multiple members.

Core columns:

- id — UUID PK.
- owner_profile_id — FK to profiles(id) NOT NULL.
- name — TEXT.
- settings — JSONB:
  - Includes workspace-level configuration, e.g. `default_currency`, `timezone`.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.
- deleted_at — TIMESTAMPTZ NULL:
  - Soft-delete marker; archived workspaces no longer appear in regular queries.

Key semantics:

- settings.default_currency:
  - Defines the workspace base currency.
  - v1 budgets expect budgets (budget_plans.currency) to use this currency; mixed currencies are explicitly future work.
- Soft delete:
  - RLS predicates and default queries include `deleted_at IS NULL`.
  - Archived workspaces never surface in normal app flows.
  - Admin exports or maintenance tools must opt in explicitly and often use dedicated roles.

---

## 2. Workspace Members and Roles

Table: workspace_members

Purpose:

- Attach profiles to workspaces with roles and optional scope JSON.
- Drives collaboration, RLS predicates, and workspace visibility.

Core columns:

- id — UUID PK.
- workspace_id — FK to workspaces(id) NOT NULL.
- member_profile_id — FK to profiles(id) NOT NULL.
- role — TEXT NOT NULL with CHECK:
  - CHECK (role IN ('owner','admin','editor','viewer'))
- scope_json — JSONB:
  - Arbitrary per-member scoping rules (e.g. subset of features, account groups).
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.

Constraints and indexes:

- UNIQUE(workspace_id, member_profile_id)
  - A profile can have at most one membership row per workspace.
- GIN index on scope_json (if needed for feature gating queries).
- Additional index on (workspace_id, member_profile_id, role) recommended for role checks.

Role semantics (enforced by app logic + RLS):

- owner:
  - Full control over workspace (manage members, connections, budgets, views, billing, settings).
- admin:
  - Manage connections, views, budgets.
  - Invite/remove non-owner members.
  - Cannot transfer or revoke owner.
- editor:
  - Read/write data (transaction overlays, budgets, views).
  - Cannot manage workspace membership or billing.
- viewer:
  - Read-only access, scoped by workspace_connection_links/account scopes.

RLS usage:

- RLS policies rely heavily on role checks at the application layer and via membership lookups in workspace_members.
- Viewer paths are granted read-only access; write policies generally require role IN ('owner','admin','editor').

---

## 3. Saved Views and View Configuration

Saved views provide reusable filters, sort orders, and grouping logic over transactions and related data.

### 3.1 saved_views

Table: saved_views

Core columns:

- id — UUID PK.
- workspace_id — FK to workspaces(id) NOT NULL.
- name — TEXT.
- is_default — BOOL:
  - Indicates the workspace’s default view (UI-level semantics).
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.
- deleted_at — TIMESTAMPTZ NULL.

Soft deletion:

- Soft-deleted views disappear from normal queries.
- RLS predicates and default queries include `deleted_at IS NULL`.
- Archived views surface only in admin exports or maintenance flows.

RLS behavior:

- Access is limited to members of the workspace via workspace_members.
- Write operations are further limited by role (owner/admin/editor).

---

### 3.2 View configuration tables

Each saved view may have multiple configuration rows, all sharing the same basic structure:

Tables:

- view_filters
- view_sorts
- view_group_by
- view_rule_overrides
- view_category_groups

Shared core columns:

- id — UUID PK.
- view_id — FK to saved_views(id) NOT NULL.
- payload — JSONB:
  - Configuration blob for each table’s purpose:
    - view_filters: filter predicates (e.g. tags, date ranges, categories).
    - view_sorts: sort directives (e.g. sort by amount descending).
    - view_group_by: grouping directives (e.g. by category/month).
    - view_rule_overrides: per-view override rules.
    - view_category_groups: logical grouping of categories into UI groupings.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.

Semantics:

- These tables collectively define the behavior of a saved view without embedding complex logic in a single JSON column.
- RLS policies ensure only workspace members can read them and only authorized roles can modify them.

---

## 4. View Sharing and Public Links

### 4.1 view_shares

Table: view_shares

Purpose:

- Allow sharing of a saved view with specific profiles, optionally with edit permissions.

Core columns:

- id — UUID PK.
- view_id — FK to saved_views(id) NOT NULL.
- profile_id — FK to profiles(id) NOT NULL.
- can_edit — BOOL NOT NULL:
  - When true, the shared profile may edit the view configuration.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.

Semantics:

- Acts as a per-view ACL for profile-based sharing beyond workspace membership.
- RLS ensures:
  - Only workspace members can see or manage shares for that workspace.
  - Only owners/admins (and sometimes editors, depending on policy) can create/update shares.

---

### 4.2 view_links

Table: view_links

Purpose:

- Provide anonymous, read-only link-based access to a saved view, gated by token and optional passcode.

Core columns:

- id — UUID PK.
- view_id — FK to saved_views(id) NOT NULL.
- token_hash — JSONB NOT NULL UNIQUE:
  - Hashed link token in the canonical envelope format.
- passcode_hash — JSONB NULL:
  - Optional hashed passcode (same envelope format).
- expires_at — TIMESTAMPTZ NOT NULL:
  - Link becomes inactive when `expires_at <= now()`.
- created_by_profile_id — FK to profiles(id) NOT NULL:
  - Creator of the link (for auditing).
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.

Indexes:

- Index on (view_id).
- Index on (expires_at) for TTL sweeps.

Semantics:

- Links act as anonymous, read-only entry points into a workspace’s data, constrained to the specific view.
- Requests via view_link:
  - Execute under a constrained service role, not app_user.
  - Verify the hashed token (and optional passcode) before applying tailored RLS that only exposes the linked view’s data.
- Management APIs:
  - Continue to rely on per-profile policies via app_user.
- TTL and cleanup:
  - A scheduled job regularly revokes and purges expired links (rows with `expires_at <= now()`).

Security notes:

- Link tokens and passcodes are shown only once at creation.
- Verification is always via hash comparisons.
- Logs and database tables must never store raw tokens.

---

## 5. Account Groups

Account groups allow workspace-level grouping of bank accounts for UI organization and filtering.

### 5.1 account_groups

Table: account_groups

Core columns:

- id — UUID PK.
- workspace_id — FK to workspaces(id) NOT NULL.
- name — TEXT.
- color — TEXT:
  - Optional UI color hint.
- sort — INT:
  - Ordering index within the workspace.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.
- deleted_at — TIMESTAMPTZ NULL.

Soft delete:

- Soft-deleted groups are hidden from default queries and UIs (using `deleted_at IS NULL` predicates).

---

### 5.2 account_group_memberships

Table: account_group_memberships

Core columns:

- id — UUID PK.
- group_id — FK to account_groups(id) NOT NULL.
- account_id — FK to bank_accounts(id) NOT NULL.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.

Constraints:

- UNIQUE(group_id, account_id)
  - Prevents duplicate membership entries for the same group/account combination.

Semantics:

- Many-to-many relationship between account groups and bank accounts.
- RLS ensures:
  - Only workspace members with access to both the workspace and the accounts see these rows.

---

## 6. Workspace Connection Links and Allowed Accounts

The access graph for workspace-level financial data is defined primarily by:

- workspace_connection_links (JSON-based scopes)
- workspace_allowed_accounts (normalized account-level scopes)

### 6.1 workspace_connection_links

Table: workspace_connection_links

Purpose:

- Represent the grant of access from a connection owner’s data into a workspace, with optional account scoping.

Core columns:

- id — UUID PK.
- workspace_id — FK to workspaces(id) NOT NULL.
- connection_id — FK to connections(id) NOT NULL.
- granted_by_profile_id — FK to profiles(id) NOT NULL.
- account_scope_json — JSONB NULL:
  - NULL: all accounts on the connection are visible to the workspace.
  - Non-NULL: JSONB array of bank_accounts.id strings.
- expires_at — TIMESTAMPTZ NULL:
  - NULL: link is valid until explicitly revoked.
  - Non-NULL: link becomes inactive once `expires_at <= now()`.
- revoked_at — TIMESTAMPTZ NULL:
  - When non-NULL, link is inactive regardless of expiry.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.

Constraints and indexes:

- UNIQUE(workspace_id, connection_id)
  WHERE revoked_at IS NULL
  - Ensures at most one active link per workspace/connection pair.
- GIN index on account_scope_json for membership checks.
- Index on (workspace_id, connection_id, revoked_at, expires_at) to support RLS and hot path queries.

account_scope_json contract:

- NULL means “all accounts on the connection are in scope”.
- Non-NULL is a JSONB array of UUID strings (bank_accounts.id).
- Constraint trigger (validate_workspace_account_scope):
  - Ensures account_scope_json is either NULL or:
    - A JSON array of UUID strings.
    - Every referenced account:
      - Exists in bank_accounts.
      - Belongs to this connection.
      - Is not soft-deleted (`deleted_at IS NULL`).

Helper pattern:

- A deterministic helper function (e.g. unwrap using jsonb_array_elements_text) is used to test membership inside account_scope_json in queries and RLS policies.

Expiry and revocation:

- expires_at NULL:
  - Link is valid until `revoked_at` is set.
- When expires_at is non-NULL:
  - Link is inactive once `expires_at <= now()` even if `revoked_at` is still NULL.
- RLS policies and soft-delete alignment:
  - Predicates generally include:
    - revoked_at IS NULL
    - (expires_at IS NULL OR expires_at > now())
  - Inactive links remain in the DB but are hidden from normal queries.

Access graph canonical model:

- connections are owned by connections.owner_profile_id.
- A workspace sees a connection’s data only if:
  1) The viewing profile is a member of the workspace (via workspace_members), and
  2) The workspace has been granted scope via:
     - workspace_connection_links (JSON scopes), and/or
     - workspace_allowed_accounts (normalized projection).
- All access-control reasoning around workspace visibility assumes this flow is the single source of truth.

---

### 6.2 workspace_allowed_accounts (normalized scope)

Table: workspace_allowed_accounts

Purpose:

- Normalized, account-level projection of workspace_connection_links.account_scope_json.
- Optimized for queries that join directly by bank_account_id instead of scanning JSON.

Core columns:

- id — UUID PK.
- workspace_id — FK to workspaces(id) NOT NULL.
- bank_account_id — FK to bank_accounts(id) NOT NULL.
- granted_by_profile_id — FK to profiles(id) NOT NULL.
- revoked_at — TIMESTAMPTZ NULL.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().

Constraints and indexes:

- UNIQUE(workspace_id, bank_account_id)
  WHERE revoked_at IS NULL
- Index on (workspace_id, bank_account_id, revoked_at) to support access checks and RLS.

Semantics:

- Pure projection:
  - Derived from workspace_connection_links.account_scope_json.
  - Background jobs (and migrations) regenerate this table from JSON scopes.
- Do not mutate this table directly:
  - It must not be treated as an alternate source of truth.
  - Application logic should always treat workspace_connection_links as canonical and consider workspace_allowed_accounts a cache/projection.

RLS alignment:

- Predicates align with link semantics:
  - revoked_at IS NULL in RLS and partial indexes.
- Inactive projections:
  - Soft-delete semantics ensure revoked rows no longer participate in access checks.

Helper function (not for RLS):

- workspace_allows_account(workspace uuid, bank_account uuid) returns boolean:
  - Checks existence of an active row in workspace_allowed_accounts or a matching JSON entry in workspace_connection_links.
  - This function is intended for application-level helpers, not for use inside RLS on these tables (to avoid recursion).

---

## 7. Workspace Categories (Collaborative Tree)

Full semantics and resolution behavior (including workspace_category_overrides) are described in database-structure-categories-and-resolution.md. This section focuses on workspace-side relational structure.

### 7.1 workspace_categories

Table: workspace_categories

Purpose:

- Shared category tree scoped to a workspace.
- Supports collaborative categorization separate from system and profile-level trees.

Core columns:

- id — UUID PK.
- workspace_id — FK to workspaces(id) NOT NULL.
- parent_id — UUID NULL REFERENCES workspace_categories(id) DEFERRABLE INITIALLY DEFERRED.
- slug — TEXT.
- name — TEXT.
- sort — INT.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.
- deleted_at — TIMESTAMPTZ NULL.
- color — TEXT NULL (optional UI color).

Uniqueness:

- UNIQUE(workspace_id, slug)
  WHERE deleted_at IS NULL

Indexes:

- Index on (workspace_id, parent_id) for tree traversals.
- Additional indexes on (workspace_id, deleted_at) if needed for hot paths.

Parent scope constraint:

- Constraint trigger (ensure_workspace_category_parent_scope):
  - Ensures parent.workspace_id = child.workspace_id.
  - Enforced as DEFERRABLE INITIALLY DEFERRED to support bulk inserts/updates.

Soft deletion:

- deleted_at NOT NULL marks archived categories.
- RLS and default queries hide soft-deleted rows.
- Admin or historical exports may explicitly include archived categories when needed.

---

### 7.2 workspace_category_overrides (workspace-level remaps)

Table: workspace_category_overrides

Purpose:

- Represent workspace-level remaps of categories used in resolution flows.
- They affect how categories are interpreted within a workspace (including budgeting).

Core columns:

- id — UUID PK.
- workspace_id — FK to workspaces(id) NOT NULL.
- source_category_id — FK workspace_categories(id) NULL.
- target_category_id — FK workspace_categories(id) NULL.
- system_source_category_id — FK categories(id) NULL.
- system_target_category_id — FK categories(id) NULL.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.
- deleted_at — TIMESTAMPTZ NULL.

Uniqueness:

- UNIQUE(workspace_id, COALESCE(source_category_id, system_source_category_id))
  WHERE deleted_at IS NULL

CHECK constraint:

- Ensures exactly one source and one target domain is used:
  - (source_category_id IS NOT NULL AND system_source_category_id IS NULL)
    OR (source_category_id IS NULL AND system_source_category_id IS NOT NULL)
  - AND the same pattern for target_category_id vs system_target_category_id.

Semantics:

- Workspace overrides may:
  - Map a system category to:
    - Another system category, or
    - A workspace category.
  - Map a workspace category to:
    - Another workspace category, or
    - (rarely) a system category.
- Resolution:
  - For profile-aware categories:
    - workspace_category_overrides are applied after view overrides and before profile overrides.
  - For workspace-wide aggregates (like budget_actuals):
    - workspace_category_overrides finalize the category for workspace-level reporting.

RLS:

- Access is limited to workspace members.
- Creation/modification is allowed only to roles with elevated permissions (owner/admin, and sometimes editor).

---

## 8. Overlay Precedence (Workspace-Aware View)

While the detailed precedence and helper functions are documented in database-structure-categories-and-resolution.md, the key workspace-oriented principle is:

- Category overrides are layered as:

  - transaction_overlays.category_id
  - view_category_overrides
  - workspace_category_overrides
  - profile_category_overrides
  - transactions.system_category_id

- Workspace and view overrides operate in terms of:
  - System categories (categories table), and
  - Workspace categories (workspace_categories table),
  - Never introducing a third category tree.

Workspace-scoped overrides:

- Only apply once a non-null current_workspace_category exists or when a system category is explicitly mapped.
- Are designed so that all derived views (including budget_actuals) use the same underlying categories as the UI.

Any change to workspace_category_overrides, workspace_categories, or view_category_overrides must keep these invariants in sync across:

- database-structure-categories-and-resolution.md
- database-structure-connections-and-ledger.md (if queries rely on categories)
- database-structure-budgets.md (for budget_actuals)
- database-structure-constraints-indexes-and-triggers.md (for related constraints and indexes)

---

## 9. Summary: Workspace and View Responsibilities

- workspaces:
  - Own collaboration context, currency settings, and default configuration.
- workspace_members:
  - Control who can read/write within a workspace, with roles and scope_json.
- saved_views (+ children):
  - Define reusable configurations for viewing/segmenting transactions and budget data.
- view_shares:
  - Share a view with specific profiles, optionally granting edit rights.
- view_links:
  - Provide anonymous, token-based, read-only access to a view within strict constraints and TTL.
- account_groups / account_group_memberships:
  - Group bank accounts for convenience and filtering.
- workspace_connection_links:
  - Canonical source for granting workspace access to a connection’s data, including JSON-scoped accounts.
- workspace_allowed_accounts:
  - Normalized projection of per-account access derived from links.
- workspace_categories and workspace_category_overrides:
  - Collaborative category tree and workspace-level remaps that influence reporting and budgeting.

When modifying any workspace or view behavior:

1. Check this file for relational and semantic constraints.  
2. Check database-structure-categories-and-resolution.md for category precedence.  
3. Check database-structure-rls-and-access-control.md for RLS expectations.  
4. Update database-structure-constraints-indexes-and-triggers.md and database-structure-migrations-ops-and-testing.md to preserve constraints and tests.


---

<!-- source: steering/delivery-hygiene-and-task-tracking.md -->

# Delivery Hygiene & Task Tracking

How to keep changes tidy, documented, and easy to reason about.

## 1. Documentation & file layout

- Centralize docs under `docs/`:
  - `docs/architecture/`
  - `docs/guides/`
  - `docs/api/`
  - `docs/operations/`
  - `docs/archived/` for old material you might need later.
- When you add a new doc:
  - Link it from `README.md` or a relevant index so it’s discoverable.
- Temporary scripts:
  - Live under something like `scripts/temp/` while in active use.
  - Either delete them when done or promote them into `tooling/scripts/` with a short doc.

## 2. Task tracking

- Use numbered checklists in `.scope/tasks/` for non-trivial work:
  - One file per feature or workstream.
  - Each task uses `[ ]` / `[x]` for status.
- Example pattern:

  1. `[ ]` Task name – quick description.
  2. `[ ]` Another task – what it should achieve.

- For each task, add **Sanity Checks**:
  - Concrete steps to verify the task is truly done (for example, a curl command, a test run, or a UI flow).
  - Prefer checks that can be re-run later.

## 3. Wrap-up checklist for a change

Before considering a task or PR “done”:

1. Code is in place and passes lint, typecheck, and unit/integration tests.
2. Docs/specs updated:
   - API docs or `database-structure-*.md` if contracts/schema changed.
   - Any relevant guides or operations docs.
3. Temporary scripts either removed or promoted to a stable home.
4. `.scope/current-phase.md` and `.scope/project_plan.md` updated if scope or milestones changed.
5. Sanity checks documented or refreshed so someone else can verify the change.

## 4. Tests from an agent context

- When running tests in an automated or non-interactive environment:
  - Use `vitest --run` / `pnpm test -- --run` to avoid watch mode.
- For new or changed behavior:
  - Add at least one test at the most appropriate layer (unit, integration, or E2E).
  - Prefer explicit test names that describe the user-visible behavior or invariant.


---

<!-- source: steering/domain-errors-and-package-structure.md -->

# Domain Errors & Package Structure

## Domain Errors Pattern

Domain errors represent **business rule violations** (not HTTP, not DB errors). They are:

- Defined in the **domain package** (e.g. `packages/core/src/tokens/token-errors.ts`).
- Thrown from **services**.
- Caught at the **route/HTTP layer** and translated into HTTP responses.

```typescript
// packages/core/src/tokens/token-errors.ts

export class TokenError extends Error {
  constructor(
    message: string,
    /** Stable machine-readable code, used for mapping/logging */
    public readonly code: string
  ) {
    super(message);
    this.name = "TokenError";
  }
}

export class DuplicateTokenNameError extends TokenError {
  constructor(name: string) {
    super(`Token name "${name}" already exists`, "TOKEN_DUPLICATE_NAME");
    this.name = "DuplicateTokenNameError";
  }
}

export class InvalidScopesError extends TokenError {
  constructor(scopes: string[]) {
    super(`Invalid scopes: ${scopes.join(", ")}`, "TOKEN_INVALID_SCOPES");
    this.name = "InvalidScopesError";
  }
}

export class TokenNotFoundError extends TokenError {
  constructor(id: string) {
    super(`Token not found: ${id}`, "TOKEN_NOT_FOUND");
    this.name = "TokenNotFoundError";
  }
}
```

**Guidelines**

- Keep domain errors **close to their domain** (e.g. `tokens/token-errors.ts`, `transactions/transaction-errors.ts`).
- Services throw domain errors; route handlers catch them and map to HTTP codes (e.g. 400, 404, 409).
- Prefer **specific error classes** over stringly-typed errors.
- Error messages should be **safe to log and, if needed, show to users**—don’t include secrets or raw tokens.
- Domain errors must **not** contain HTTP status codes or HTTP-specific concerns; mapping happens in `apps/api`.

Optional pattern for cross-cutting errors:

- Keep truly generic errors (e.g. `DomainError`, `OptimisticLockError`) in a shared module like `packages/core/src/shared/errors.ts`.

---

## Package Structure for Domain Logic

```text
packages/core/src/
├─ tokens/
│  ├─ token-service.ts             # Business logic
│  ├─ token-repository.ts          # Data access
│  ├─ token-errors.ts              # Domain errors
│  ├─ token-types.ts               # Domain types / DTOs
│  ├─ index.ts                     # Public API for the tokens domain
│  └─ __tests__/
│     ├─ token-service.test.ts     # Unit tests (no DB)
│     └─ token-repository.test.ts  # Integration tests (with DB)
├─ connections/
│  ├─ connection-service.ts
│  ├─ connection-repository.ts
│  ├─ connection-errors.ts?        # As needed
│  └─ ...
├─ transactions/
│  ├─ transaction-service.ts
│  ├─ transaction-repository.ts
│  └─ ...
└─ budgets/
   ├─ budget-service.ts
   ├─ budget-repository.ts
   └─ ...
```

**Guidelines**

- **One folder per domain** (`tokens`, `connections`, `transactions`, `budgets`, …).
- Each domain typically gets:
  - `*-service.ts` — business logic (services).
  - `*-repository.ts` — data access (Prisma, etc.).
  - `*-errors.ts` — domain errors (if the domain has non-trivial rules).
  - `*-types.ts` — domain types / DTOs (input/output shapes, domain models).
  - `index.ts` — public exports used by other packages (`apps/api`, etc.).
- Tests live per domain under `__tests__/`:
  - Service tests are **unit tests** (mock/fake repos).
  - Repository tests are **integration tests** (real DB).
- External code should import from the **domain’s `index.ts`**, not from deep paths inside the folder.


---

<!-- source: steering/git-workflow-and-culture.md -->

# Git Workflow, Culture & Collaboration

This doc describes how we use git and collaborate around changes. Agents do **not** run mutating git commands; the user controls the repo.

## 1. Agent boundaries with git

- Do **not** run:
  - `git add`, `git commit`, `git push`, `git merge`, `git rebase`, etc.
- It’s fine to **read** git state for context:
  - `git status`
  - `git diff`
  - `git log`
- Focus your work on:
  - Editing files.
  - Keeping changes focused and cohesive.
  - Leaving clear notes or checklists that the user can turn into commits.

## 2. Branching & PR philosophy

(For humans using the repo; agents should align with the spirit.)

- Prefer **feature-focused branches** over giant, multi-purpose branches.
- Keep PRs:
  - Small and reviewable.
  - Scoped to a single concern (for example, “add budgets API” vs “budgets + UI + refactor auth”).
- Flag risky areas early:
  - Auth changes.
  - Billing/Stripe logic.
  - Database migrations / RLS changes.

## 3. Collaboration culture

- Prefer **clarity over cleverness**:
  - Good naming reduces the need for heavy comments.
  - Use comments when intent isn’t obvious or when something deviates from the usual patterns.
- Celebrate deletions:
  - Removing unused code, dead flags, and duplicate patterns is valuable work.
- When specs and code diverge:
  - Update the spec and point to it in code comments.
  - Leave a short rationale if you need to deviate from a pattern (for example, breaking a layering rule for a pragmatic reason).

## 4. Practical notes for agents

- When making non-trivial changes:
  - Suggest a concise commit message in your notes (the user will actually commit).
  - Call out any follow-ups or TODOs that should become future tasks.
- When you’re unsure:
  - Prefer asking for clarification rather than guessing on auth, billing, or schema changes.


---

<!-- source: steering/planning-and-overview.md -->

Guidelines to keep work focused, production-ready, and simple while we reshape the repo.

- When assigned with a task, before coding, create a file in .scope/tasks/ directory. in the file create a task-list. The task list should be numbered and use [ ] so we can later mark complete with [x]. At the end of each task add a clear sannity check i can test (if applicable). Once task list is completed wait for the user to fire off the tasks one item at a time.
- Task lists should be feature-aligned optimized, not giant dumps
- Flag risky changes early (auth, billing, migrations) so we can plan rollbacks.


---

<!-- source: steering/route-handlers.md -->

# HTTP Route Handler Pattern (Hono / API Layer)

## Route Handler Pattern (HTTP Layer)

**Route handlers should be thin controllers:**

```typescript
// ✅ GOOD - Thin controller
export const createExampleRoute = new Hono<AuthContext>();

createExampleRoute.post(
  "/",
  authMiddleware,
  rateLimitMiddleware,
  zValidator("json", CreateExampleSchema),
  async (c) => {
    const userId = c.get("userId");
    const data = c.req.valid("json");

    try {
      const result = await exampleService.createExample({ userId, ...data });
      return c.json(result, 201);
    } catch (error) {
      if (error instanceof DuplicateNameError) {
        return c.json({ error: error.message }, 409);
      }
      throw error;
    }
  }
);
```

```typescript
// ❌ BAD - Fat controller with business logic and DB access
createExampleRoute.post("/", async (c) => {
  const userId = c.get("userId");
  const { name } = await c.req.json();

  // ❌ Validation in controller
  if (!name) {
    return c.json({ error: "Invalid name" }, 400);
  }

  // ❌ Database access in controller
  const existing = await prisma.example.findUnique({
    where: { userId_name: { userId, name } },
  });

  if (existing) {
    return c.json({ error: "Duplicate name" }, 409);
  }

  // ❌ Business logic in controller
  const record = await prisma.example.create({
    data: { userId, name },
  });

  return c.json(record, 201);
});
```

**Controller responsibilities recap:**

- Parse/validate HTTP input (with Zod validators).
- Pull context values (`userId`, `profileId`, `workspaceId`, `requestId`).
- Call a service method.
- Map domain errors → HTTP status codes.
- Format the HTTP response body and status code.


---

<!-- source: steering/security-and-secrets-management.md -->

# Security & Secrets Management

This doc captures the security guardrails and secret-handling rules for SuperBasic Finance.

## 1. Security & compliance expectations

- Enforce `Authorization: Bearer` on all `/v1` routes unless explicitly documented as public.
- Respect **Postgres RLS** on all multi-tenant tables:
  - RLS depends on `current_setting('app.user_id')`, `current_setting('app.profile_id')`, and `current_setting('app.workspace_id')`.
  - Do not add queries that assume cross-tenant visibility or bypass RLS.
- Log security-sensitive actions with enough context to audit:
  - API key create/revoke.
  - Workspace membership changes.
  - Billing changes and failed Stripe/Plaid webhooks.
- Avoid leaking internals:
  - Standardize error responses (code + message) without including stack traces.
  - Use structured logging (requestId, user/profile/workspace IDs, route, etc.) instead of dumping raw errors.

## 2. Secrets management

**Never** hardcode real secrets in code, scripts, or documentation.

- Use placeholders everywhere:
  - `PLAID_CLIENT_ID=your_client_id_here`
  - `STRIPE_SECRET_KEY=sk_test_your_key_here`
  - `RESEND_API_KEY=re_your_key_here`
- `.env.example`:
  - Only placeholder values.
  - No real keys, even in test or sandbox mode.
- Scripts:
  - Require secrets via environment variables.
  - Fail fast with a clear error if a required env var is missing.
- Documentation:
  - Show patterns, not real values. Example:
    - ✅ `RESEND_API_KEY=re_your_key pnpm tsx script.ts`
    - ❌ `RESEND_API_KEY=re_QCFJoGYk_real_key pnpm tsx script.ts`

## 3. Secret rotation

If a secret is ever exposed (for example, pasted in a doc or log):

1. Rotate the key in the provider (Stripe, Plaid, Resend, etc.).
2. Update `.env` and any CI secrets.
3. Replace any examples with placeholders.
4. Add a short note to the relevant ops/runbook doc describing what happened and the fix.

## 4. Browser vs server boundaries

- Never put Stripe, Plaid, or other provider secrets in `apps/web` or any code shipped to the browser.
- The browser should only ever receive:
  - Public keys/tokens intended for client-side use.
  - Temporary tokens that are safe to expose (e.g., Plaid Link token).
- All sensitive exchanges (token swaps, secret-key calls) must go through **server-side** routes in `apps/api`.


---

<!-- source: steering/services-repositories-and-di.md -->

# Services, Repositories & Dependency Injection

This doc explains how we structure **business logic**, **data access**, and **dependency injection**.

Goals:

- Keep HTTP, business rules, and persistence **separate**.
- Make domain logic **easy to test**.
- Make it obvious **where code belongs**.

---

## 1. Core Rules

**Services**

- Implement business operations per domain (tokens, transactions, budgets, …).
- Orchestrate repositories, apply business rules, emit domain events.
- Return **domain/DTO types**, not raw Prisma models.
- Throw **domain errors** (e.g. `DuplicateTokenNameError`), not HTTP responses.

**Repositories**

- Wrap **Prisma** (or other persistence).
- Do **pure CRUD / queries**.
- Return **Prisma entities**.
- Contain **no business logic or validation**.

**Dependency Injection**

- Wire real dependencies in **`apps/api`**, not in `packages/core`.
- Use **constructor injection** so services are easy to test with fakes/mocks.

**Default style**

- Use **class-based services by default**.
- Use **functional services** only for small, stateless, one-off operations.

---

## 2. Service Pattern (Business Logic)

**Class-based service (default)**

```typescript
export class ExampleService {
  constructor(
    private exampleRepo: ExampleRepository,
    private auditLogger: AuditLogger
  ) {}

  async doWork(params: DoWorkParams): Promise<DoWorkResult> {
    // validate params
    // orchestrate repos
    // emit domain events
    const record = await this.exampleRepo.create(params);
    await this.auditLogger.logExampleCreated({ id: record.id });
    return mapToDto(record);
  }
}
```

**Functional style (optional for simple cases)**

```typescript
export async function doWork(
  params: DoWorkParams,
  deps: { exampleRepo: ExampleRepository; auditLogger: AuditLogger }
): Promise<DoWorkResult> {
  // Same rules and flow as the class method
}
```

**HTTP layer maps domain errors → HTTP responses**

```typescript
createRoute.post("/", async (c) => {
  const body = c.req.valid("json");

  try {
    const result = await exampleService.doWork(body);
    return c.json(result, 201);
  } catch (error) {
    if (error instanceof DomainConflictError) {
      return c.json({ error: error.message }, 409);
    }
    throw error;
  }
});
```

---

## 3. Domain Errors

Domain errors live in the domain package and represent **business rule violations**.

```typescript
// packages/core/src/tokens/token-errors.ts

export class TokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenError";
  }
}

export class DuplicateTokenNameError extends TokenError {
  constructor(name: string) {
    super(`Token name "${name}" already exists`);
    this.name = "DuplicateTokenNameError";
  }
}

export class InvalidScopesError extends TokenError {
  constructor(scopes: string[]) {
    super(`Invalid scopes: ${scopes.join(", ")}`);
    this.name = "InvalidScopesError";
  }
}
```

---

## 4. Repository Pattern (Data Access)

Repositories are thin Prisma wrappers. They return **Prisma entities**, not DTOs.

**Guidelines**

- No HTTP, no DTO mapping, no domain errors here.
- Services handle mapping and business rules.

---

## 5. Transactions (Multi-Repo Workflows)

If a business operation needs multiple writes that must succeed/fail together, use a transaction.

```typescript
// packages/core/src/shared/database.ts

export class Database {
  constructor(private prisma: PrismaClient) {}

  async tx<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => fn(tx));
  }
}
```

```typescript
// packages/core/src/connections/connection-service.ts

export class ConnectionService {
  constructor(
    private db: Database,
    private connectionRepo: ConnectionRepository,
    private accountRepo: AccountRepository
  ) {}

  async createConnectionWithAccounts(params: CreateConnectionWithAccountsParams) {
    return this.db.tx(async (tx) => {
      const connection = await this.connectionRepo.create(tx, { /* ... */ });
      const accounts = await this.accountRepo.bulkCreate(tx, {
        connectionId: connection.id,
        accounts: params.accounts,
      });

      return { connection, accounts };
    });
  }
}
```

---

## 6. Dependency Injection (apps/api)

Wire **real** dependencies at the app edge, grouped per domain.

PAT routes now use auth-core directly; avoid wiring legacy `TokenService`/`TokenRepository` in `apps/api`. Keep DI wiring focused on active domains (e.g., connections, budgets, etc.) and instantiate services at the app edge as needed.

---

## 7. Anti-Patterns (Red Flags in PRs)

- ❌ Inject `PrismaClient` directly into services.  
  ✅ Always go through repositories.

- ❌ Call repositories from route handlers.  
  ✅ Routes → services → repositories.

- ❌ Put business logic or validation in repositories.  
  ✅ Business rules live in services/domain helpers.

- ❌ Return HTTP responses or use `c.json(...)` in services or repositories.  
  ✅ Only the HTTP layer knows about HTTP.

- ❌ Map Prisma entities to DTOs in repositories.  
  ✅ Repos return persistence entities; services map to domain/response types.

---

## 8. TL;DR

- **Services:** business workflows, domain rules, orchestration, domain errors, DTOs.
- **Repositories:** Prisma CRUD only, return Prisma models.
- **DI:** wired in `apps/api`, per-domain, via constructor injection.
- **Routes:** thin controllers that translate HTTP ↔ domain and call services only.


---

<!-- source: steering/tech-stack-and-commands.md -->

# Tech Stack & Handy Commands

Quick reference for the main technologies and everyday commands used in SuperBasic Finance.

## 1. Backend stack

- **Runtime:** Node 20+
- **Framework:** Hono (Node adapter; future Edge-capable)
- **Validation & contracts:** Zod → OpenAPI 3.1
- **ORM & DB:** Prisma 6 on Neon Postgres (UUID PKs, `TIMESTAMPTZ`, `BIGINT` cents)
- **Auth:** Auth-core OAuth 2.1/OIDC + PATs
- **Payments:** Stripe (Checkout, Portal, webhooks)
- **Banking:** Plaid (Link + server-side token exchange)
- **Background jobs:** Upstash Redis / QStash + Vercel Cron
- **Testing:** Vitest (unit/integration)

## 2. Frontend stack

- **Build tool:** Vite
- **UI:** React 19 + Tailwind
- **Routing:** React Router
- **Data fetching:** TanStack Query
- **Packaging:** SPA designed to be **Capacitor-ready** for mobile.

## 3. Tooling

- **Package manager:** pnpm workspaces
- **Monorepo:** Turborepo
- **Lint/format:** Biome and/or ESLint + Prettier (as configured)
- **Bundling:** tsup (for packages)
- **Hooks:** Husky + lint-staged
- **E2E:** Playwright
- **Versioning / releases:** Changesets (planned/optional)

## 4. Common commands

> Adjust `--filter` flags as needed (api, web, etc.).

- Install dependencies:  
  `pnpm install`

- Start dev servers:  
  `pnpm dev`  
  `pnpm dev --filter=api`  
  `pnpm dev --filter=web`

- Build:  
  `pnpm build`  
  `pnpm build --filter=api`

- Tests:  
  `pnpm test`  
  `pnpm test:unit`  
  `pnpm test:e2e`  
  (For agents/non-interactive: `pnpm test -- --run`)

- Lint, typecheck, format:  
  `pnpm lint`  
  `pnpm typecheck`  
  `pnpm format`

- Database (Prisma):  
  `pnpm db:migrate`  
  `pnpm db:generate`  
  `pnpm db:studio`

- API docs and SDK:  
  `pnpm api:docs`  
  `pnpm sdk:generate`

Keep this file as a **lookup**, not a full spec. When making deeper changes, rely on the architecture and steering docs as well.


---

<!-- source: steering/testing-observability-and-ops.md -->

# Testing, Observability & Operational Hygiene

## Testing Strategy by Layer

**Unit Tests (`packages/core`):**

- Test services with mocked repositories.
- Test repositories with a test database.
- Test utilities as pure functions.
- No HTTP mocking needed.

**Integration Tests (`apps/api`):**

- Test route handlers with real services.
- Test full request/response cycle (happy + failure paths).
- Test middleware integration (auth, rate limits, validation).
- Use a test database.

**E2E Tests (`apps/web`):**

- Test user flows through the UI.
- Test against a running API instance.
- Test OAuth/auth flows end-to-end.

## Testing & Verification (Release Checklist)

- Default pre-commit / pre-push check: run `pnpm run lint`, `pnpm run test`, and `pnpm run build`.
- Add unit tests alongside new core logic and integration tests for new `/v1` routes.
- Run end-to-end smoke tests (login, key creation, checkout, Plaid link) before releases.
- Verify OpenAPI diff is expected and that SDK build completes in CI.
- Ensure migrations have been applied in non-prod environments before promoting to prod.

## Observability & Monitoring

- Attach a `requestId` to every API request; include it in logs and audit entries.
- Standardize error responses with codes and messages; avoid leaking internal stack traces.
- Ensure Sentry (or equivalent) captures both edge and node environments.
- Ensure structured logs (e.g. Pino) include relevant metadata (requestId, user/profile/workspace IDs, route, etc.).
- For incidents, logs + traces should be enough to reconstruct:  
  *what happened, to whom, and when.*

## Operational Hygiene

- Document deploy steps in `tooling/ci` and keep them reproducible.
- Store runbooks for Stripe/Plaid webhook rotation, key revocation, and incident response.
- Keep `.env.example` updated with only the vars needed by each app.
- When removing packages/apps, archive them first so we can resurrect them if needed.
- Prefer explicit scripts (`package.json` or `tooling/`) over ad-hoc shell one-liners for operational tasks.

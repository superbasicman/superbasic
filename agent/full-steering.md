# SuperBasic Agents Guide (Lean)

This file has two jobs:
1. **Preamble:** instructions that should be loaded into every chat.
2. **Context map:** where agents should look for deeper docs depending on the task.

---

## 1. Preamble — load this into every chat

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
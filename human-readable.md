# How SuperBasic Works (Plain-English Overview)

- **What it is**: API-first personal finance platform. React SPA (and mobile) talk only to a typed `/v1` JSON API. Everything is multi-tenant with Postgres RLS.

- **Architecture**: Three layers by design:
  - `apps/api`: Hono routes that parse requests with Zod, pull context (user/profile/workspace), and map domain errors to HTTP.
  - `packages/core`: Services implement business rules and workflows; repositories are Prisma-only CRUD.
  - Database (via `packages/database`): Prisma schema + SQL migrations, with RLS enforced through GUCs (`app.user_id`, `app.profile_id`, `app.workspace_id`, `app.mfa_level`, `app.service_id`).

- **Auth**: Auth-core (not Auth.js). OAuth 2.1/OIDC, short-lived access tokens (JWT), rotated refresh tokens (opaque hash envelopes), and PATs/API keys for programmatic access. MFA enforced for high-risk actions. Auth tables: `users`, `user_identities`, `auth_sessions`, `refresh_tokens`, `verification_tokens`, `session_transfer_tokens`, `api_keys`.

- **Domain model (starts at profile)**:
  - Profiles own connections (banks) and their accounts:
    - `profiles` → `connections` (banks) → `bank_accounts` → `transactions` → overlays/adjustments
  - Workspaces link to banks (connections); views filter transactions:
    - `workspaces` link to connections to choose which bank data is usable in that workspace.
    - `views` apply filters directly to transactions (by accounts, date, name, include/exclude, custom rules) to shape what is shown.
  - Transactions are append-only; edits live in overlays/adjustments, never direct mutation.
  - Workspace membership governs access; RLS uses workspace/profile GUCs for isolation.

- **Primary flows**:
  - **AuthN/AuthZ**: OAuth authorize → token issuance (access + refresh) → RLS GUCs set per request → PATs for programmatic access. Refresh tokens rotate; reuse is detected and handled per end-auth-goal.
  - **Data access**: Clients call `/v1` routes; handlers validate, set context, call services, and return JSON. No direct DB from clients.
  - **Bank data**: Connections sync via background jobs; transactions ingested append-only; overlays/adjustments provide user edits.
  - **API keys**: PATs are hashed envelopes, workspace- or user-scoped; revocation and audit tracked.

- **Safety & hygiene**:
  - RLS everywhere for tenant data; no BYPASSRLS adapter roles.
  - Secrets never shipped to the browser; providers stay server-side.
  - Tests by layer: unit (`packages/core`), integration (`apps/api`), E2E (`apps/web`/mobile). Run with `pnpm test -- --run` in non-interactive contexts.
  - Docs/specs must stay in sync with schema, Zod contracts, and OpenAPI.

- **Tooling highlights**:
  - pnpm/Turborepo monorepo.
  - Prisma + SQL migrations (UUID PKs, TIMESTAMPTZ, BIGINT cents).
  - Biome for lint/format; Vitest for tests; tsup for builds.

- **What is legacy**:
  - `packages/auth` is a legacy Auth.js helper; auth-core is the source of truth.
  - Any remaining Auth.js references are historical; new work must use auth-core patterns.

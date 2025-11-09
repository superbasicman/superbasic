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

RLS is enabled and forced for all user-facing application tables, plus internal caches, except Auth.js tables (which are isolated behind `auth_service`).

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

Auth.js adapter tables are intentionally **not** under RLS:

- `users`
- `accounts`
- `sessions`
- `verification_tokens`

They are protected instead via:

- Isolation behind a dedicated `auth_service` DB role.
- Hashed tokens.
- Application-level access control.

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

- `auth_service`:

  - Used by Auth.js flows, separate from `app_user`.
  - May have `BYPASSRLS` on Auth.js tables (`users`, `accounts`, `sessions`, `verification_tokens`).
  - Kept behind a separate connection pool or logical service.

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

Auth.js tables:

- Run under `auth_service` with `BYPASSRLS`.
- They are intentionally excluded from the RLS coverage checklist.

---

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

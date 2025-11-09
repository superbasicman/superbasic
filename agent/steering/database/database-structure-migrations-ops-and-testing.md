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
      - Auth.js records (`users`, `accounts`, `sessions`, `verification_tokens`).
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
  - Auth.js adapter:
    - Uses UUID PKs.
    - Stores lowercased emails with unique index (`email_lower`).
    - Stores only hashed tokens.

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

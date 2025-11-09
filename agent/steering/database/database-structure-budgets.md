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

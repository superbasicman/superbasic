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

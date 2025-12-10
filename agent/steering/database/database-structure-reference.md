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

- Auth/identity tables (`users`, `accounts`, `sessions`, `verification_tokens`) and their essential fields.
- Token hashing/envelopes for auth-core refresh tokens, verification tokens, session-transfer tokens, and PATs.
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
  - `app_user`, migration role.
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
  - `api_keys.key_hash`, `view_links.token_hash`, `view_links.passcode_hash`, `sessions.session_token_hash`, `verification_tokens.token_hash`.
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

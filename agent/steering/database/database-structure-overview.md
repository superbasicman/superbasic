# SuperBasic Finance — Database Schema Overview (Auth.js + Prisma 6 + Neon)

API-first, multi-tenant, append-only finance DB.

- Auth.js handles identity; domain logic keys off `profiles.id`.
- Transactions are immutable; edits live in overlays.
- Workspaces enable collaboration via scoped connection-links.
- All bearer tokens are hashed; provider secrets are encrypted.
- Enums prefer `TEXT + CHECK` instead of `ENUM` to avoid migration pain.

This file gives you the big-picture shape of the database and the core conventions. For table-level details, refer to the more specific `database-structure-*.md` files listed in `database-structure-reference.md`.

---

## 1. Tech and Conventions

### 1.1 Engine and ORM

- Engine: Postgres (Neon).
- ORM: Prisma 6 (strict mode).
- Prisma schema is the primary generated model; SQL migrations define advanced constraints, indexes, RLS, and triggers.

### 1.2 IDs

- All primary keys use UUID v4.
- Auth.js adapter models are aligned to UUIDs:
  - Prisma models for Auth.js tables use `@default(uuid())` and `@db.Uuid` (or `gen_random_uuid()` at the SQL layer).
- Foreign keys must use the same UUID type; no mixing of text/UUID.

### 1.3 Timestamps

- Timestamps use `TIMESTAMPTZ` everywhere.
- `created_at`:
  - `TIMESTAMPTZ NOT NULL DEFAULT now()`.
- `updated_at`:
  - Managed by Prisma via `@updatedAt`; **no database DEFAULT** to avoid drift.
- Append-only tables (e.g. `transactions`, `transaction_audit_log`) may omit `updated_at` but still require `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.

### 1.4 Money Representation

All monetary values follow a strict pattern:

- Type pair:
  - `amount_cents BIGINT`
  - `currency VARCHAR(3) CHECK (char_length(currency) = 3)`
- Sign convention:
  - Inflows / credits (deposits, refunds, income) are stored as **positive** `amount_cents`.
  - Outflows / debits (purchases, payments, fees) are stored as **negative** `amount_cents`.
  - Zero is reserved for explicit adjustments tracked via overlays.
- Provider payload normalization:
  - Ingestion must normalize all provider values to this sign convention before persistence so downstream reporting and budgeting stay consistent.
- Zero-amount rows:
  - Provider-supplied zero-amount holds/voids should be normalized away or represented only as overlays; **base `transactions` rows never store 0-cent amounts**.
  - This keeps reporting math deterministic and avoids spurious entries.
- Money pair everywhere:
  - Every monetary column appears as the `(amount_cents BIGINT, currency VARCHAR(3))` pair documented here (e.g. `transactions`, `budget_actuals.posted_amount_cents`, `budget_actuals.authorized_amount_cents`).
  - Introducing a new money field without this pair is disallowed.
  - Migrations must add both columns together and wire them into the schema docs before review.
- Single exception:
  - `budget_envelopes.limit_cents` is the lone standalone cents column.
  - Its currency is always equal to `budget_plans.currency`, enforced via `budget_plans_enforce_currency`.
  - Treat `(limit_cents, budget_plans.currency)` as that table’s logical money pair.
  - Do not introduce additional standalone `*_cents` columns elsewhere.

### 1.5 JSON / JSONB

- Use `JSONB` for configuration, scopes, and flexible filters.
- Typical JSONB columns:
  - `settings`, `scope_json`, `account_scope_json`, `config`, `raw_payload`, `stats`, `splits`, `tags` (arrays), etc.
- GIN indexes are added only when a JSONB column is on a hot query path.
- Prefer `jsonb_path_ops` GIN when queries use `@>` containment.

### 1.6 Auth.js Tables and Access

- Auth tables:
  - `users`
  - `accounts`
  - `sessions` (if using DB sessions)
  - `verification_tokens`
- These tables:
  - Store hashed tokens (never plaintext).
  - Use `TIMESTAMPTZ` timestamps (`created_at` / `updated_at` / `expires`).
  - Are accessed by a dedicated database role (e.g. `auth_service`) with `BYPASSRLS`.
- RLS is **not** enabled on Auth.js tables:
  - They are protected by hashed tokens, strict adapter usage, and separation between the auth role and the general `app_user` role.
- Application traffic:
  - Uses `app_user` with RLS enabled on domain tables.
  - Never connects using `auth_service` credentials.

### 1.7 RLS GUCs and Session Context

Most domain tables rely on three Postgres GUCs for row-level security:

- `current_setting('app.user_id', true)`
- `current_setting('app.profile_id', true)`
- `current_setting('app.workspace_id', true)`

At request start:

- Within a single DB session/transaction:

  - `SET LOCAL app.user_id = '<users.id>';`
  - `SET LOCAL app.profile_id = '<profiles.id>';`
  - `SET LOCAL app.workspace_id = '<workspaces.id or NULL>';`

- All application queries for that request must run inside this transaction and use the same connection so the GUCs remain in scope.

Application contract:

- All user traffic goes through a shared helper (e.g. `withAppContext`) that:
  - Opens a transaction.
  - Sets the three GUCs via `SET LOCAL`.
  - Hands a transactional Prisma client (`tx`) to downstream code.
- Direct `prisma.<model>` calls outside that helper are considered violations and should be blocked by lint rules and code review.

### 1.8 Not-Null Discipline and Soft Deletes

Not-null discipline:

- All foreign keys (`*_id`), key/hash/status columns, and timestamps (`created_at` / `updated_at`) are `NOT NULL`, with sensible defaults where applicable.
- Append-only tables still follow these rules but may omit `updated_at`.

Soft deletes:

- `deleted_at` and `revoked_at` fields:
  - Default to `NULL`.
  - Represent soft-deleted/archived rows when non-NULL.
- RLS predicates and partial indexes must:
  - Filter active rows with `WHERE deleted_at IS NULL` or `WHERE revoked_at IS NULL`.
  - Keep inactive rows out of hot paths and conflict checks.
- Archived data:
  - Remains stored for audit/maintenance flows under dedicated roles.
  - Is invisible to normal application queries unless a specific admin/reporting path opts in.

Admin/reporting access:

- Only explicitly documented admin/reporting flows may read archived rows.
- These flows use dedicated roles or flags; they do not reuse the general `app_user` policies.

### 1.9 ZERO_UUID Shorthand

- `ZERO_UUID` is a literal sentinel UUID value:

  - `'00000000-0000-0000-0000-000000000000'::uuid`

- Used when coalescing nullable keys into a uniform scope, for example:

  - `COALESCE(profile_id, ZERO_UUID)` in uniqueness constraints or indexes (e.g. categories slug uniqueness).

Guideline:

- Whenever documentation or code references `ZERO_UUID`, it means this exact literal sentinel UUID.

### 1.10 Email Handling

- Email addresses are stored and compared case-insensitively.
- Canonical columns:
  - `users.email` — original casing, not unique.
  - `users.email_lower` — `LOWER(email)`, `TEXT NOT NULL UNIQUE`.
- Requirements:
  - Enforce uniqueness on `email_lower`, **not** on `email`.
  - Drop any legacy unique index on `email` to avoid case-collision issues.
  - Optional non-unique index on `email` is fine for lookups by original casing if needed.

---

## 2. Core Principles

These principles guide every schema, constraint, and policy:

1. **Append-only ledger**
   - Base `transactions` rows are **never** updated or deleted.
   - Mutations happen through overlays, new append entries, or supporting tables.
   - Triggers and privileges enforce this at the database level.

2. **Profile-centric domain**
   - Domain tables key ownership off `profiles.id`, not `users.id`.
   - Auth.js `users` represent identity; `profiles` represent domain-level presence and preferences (timezone, currency, etc.).
   - Many entities reference `profile_id` rather than `user_id` to allow future multi-profile-per-user patterns.

3. **Workspace collaboration**
   - Collaboration flows through `workspaces` and `workspace_members`.
   - Access to connections/accounts and transactions in a workspace is controlled via:
     - `workspace_connection_links` (JSON account scopes) and
     - `workspace_allowed_accounts` (normalized account scopes).
   - RLS and application logic assume this graph is the single source of truth for workspace visibility.

4. **Deterministic uniqueness**
   - Provider IDs, token IDs, and other externally supplied identifiers are always combined with context and hashed or constrained to avoid collisions.
   - Example: `UNIQUE (provider, provider_item_id)` on `connections`.
   - All uniqueness constraints mirror soft-delete predicates to avoid archived rows causing conflicts.

5. **Observability**
   - Audit tables, sync logs, and soft-delete fields preserve history.
   - Append-only logs and audit tables (e.g. `transaction_audit_log`, `sync_audit_log`, `connection_sponsor_history`) provide a clear trail for operations and debugging.
   - Partial indexes focus hot operations on active rows; archival data remains queryable but off the hot path.

---

## 3. Entity Tree (High-Level)

This is the conceptual layout of the main tables and how they hang together. Use it to orient yourself before jumping into specific table specs.

`db`
- `users` — Auth.js identities (UUID PK)
  - `accounts` (FK `users.id`) — OAuth accounts
  - `sessions` (FK `users.id`) — optional DB-backed sessions
  - `verification_tokens` — passwordless and email flows (hashed)
- `profiles` (FK `users.id`) — user metadata (timezone, currency, settings)
  - `api_keys` (FK `users.id`, `profiles.id`, optionally `workspaces.id`) — hashed PATs + scopes
  - `subscriptions` (FK `profiles.id`) — Stripe linkage + slot limits
  - `categories` (FK `profiles.id`, nullable) — system tree when `profile_id` is NULL; parent/slug structure
  - `profile_category_overrides` (FK `profiles.id`, source/target `categories.id`) — per-profile remaps

- `workspaces` (FK `profiles.id` as owner)
  - `workspace_members` (FK `workspaces.id`, member profile, role, scope JSON)
  - `saved_views` (FK `workspaces.id`)
    - `view_filters` (FK `saved_views.id`)
    - `view_sorts` (FK `saved_views.id`)
    - `view_group_by` (FK `saved_views.id`)
    - `view_rule_overrides` (FK `saved_views.id`)
    - `view_category_groups` (FK `saved_views.id`)
    - `view_shares` (FK `saved_views.id`, `profiles.id`)
    - `view_links` (FK `saved_views.id`) — token_hash + passcode_hash + expiry
    - `view_category_overrides` (FK `saved_views.id`, source/target categories/workspace_categories)
  - `account_groups` (FK `workspaces.id`)
    - `account_group_memberships` (FK `account_groups.id`, `bank_accounts.id`)
  - `workspace_connection_links`
    - Workspace-scoped access to connections and accounts:
      - `workspaces.id`
      - `connections.id`
      - `granted_by_profile.id`
      - `account_scope_json`
      - `expires_at`, `revoked_at`
  - `workspace_allowed_accounts`
    - Normalized per-account scope:
      - `workspaces.id`
      - `bank_accounts.id`
      - `granted_by_profile.id`
  - `workspace_categories`
    - Shared, workspace-level category tree:
      - `workspaces.id`
      - `slug`, `name`, `parent_id`, optional `color`
  - `workspace_category_overrides`
    - Workspace-level category remaps:
      - `workspaces.id`
      - Source/target category IDs and scope info

- `budget_plans` (FK `workspaces.id`, `profiles.id` owner)
  - `budget_versions` (FK `budget_plans.id`)
    - `budget_envelopes` (FK `budget_versions.id`, optional `categories.id`)

- `connections` (FK `profiles.id` owner)
  - `connection_sponsor_history` (FK `connections.id`, from/to `profiles.id`)
  - `bank_accounts` (FK `connections.id`)
    - `transactions` (FK `bank_accounts.id`, `connections.id`) — immutable base ledger
      - `transaction_overlays` (FK `transactions.id`, `profiles.id`)
      - `transaction_audit_log` (FK `transactions.id`, `sync_sessions.id`)

  - `sync_sessions` (FK `connections.id`, `profiles.id` initiator)
    - `session_page_payloads` (FK `sync_sessions.id`)
    - `session_idempotency` (FK `sync_sessions.id`)
    - `session_leases` (FK `sync_sessions.id`)
    - `sync_audit_log` (FK `connections.id`, optional `sync_sessions.id`, optional initiator profile)

- `performance_caches` (logical grouping)
  - `user_connection_access_cache`
    - Keys: `profile_id`, `connection_id`, optional `workspace_id`, `account_scope_json`, optional `user_id`
  - `profile_transaction_access_cache`
    - Keys: `transaction_id`, `profile_id`, optional `workspace_id`, `connection_id`, `account_id`

Additional sections (budgets, constraints, RLS, tokens, migrations, ops) are described in detail in the more focused files:

- `database-structure-identity-and-access.md`
- `database-structure-categories-and-resolution.md`
- `database-structure-workspaces-and-views.md`
- `database-structure-budgets.md`
- `database-structure-connections-and-ledger.md`
- `database-structure-sync-and-caches.md`
- `database-structure-constraints-indexes-and-triggers.md`
- `database-structure-rls-and-access-control.md`
- `database-structure-rls-policies-and-ddl.sql.md`
- `database-structure-tokens-and-secrets.md`
- `database-structure-migrations-ops-and-testing.md`

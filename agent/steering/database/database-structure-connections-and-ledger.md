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

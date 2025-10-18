SuperBasic Finance — Database Schema (Auth.js + Prisma 6 + Neon)

API-first, multi-tenant, append-only finance DB. Auth.js handles identity; domain logic keys off profiles.id. Transactions are immutable; edits live in overlays. Workspaces enable collaboration via scoped connection-links. All sensitive tokens are hashed. Enums use TEXT + CHECK to avoid migration pain.

---

1. Tech and Conventions

Engine: Postgres (Neon)
ORM: Prisma 6 (strict)
IDs: UUID v4 for all PKs (unify Auth.js adapter to UUID)
Timestamps: TIMESTAMPTZ with created_at DEFAULT now(), updated_at DEFAULT now()
Money: BIGINT amount_cents, currency CHAR(3)
JSON: JSONB with GIN indexes for scope/config/filter fields
Auth: Auth.js Prisma adapter (users, accounts, sessions, verification_tokens) with token hashes
RLS: current_setting('app.user_id'/'app.profile_id'/'app.workspace_id') set per request

---

2. Core Principles

Append-only ledger: transactions base rows never updated or deleted
Profile-centric domain: business tables use profiles.id (not users.id) for ownership
Workspace collaboration: access via workspace_members and workspace_connection_links
Deterministic uniqueness: provider and token identifiers hashed and unique
Observability: audit tables, soft deletes, partial indexes for active rows

---

3. Entity Tree (High-Level)

db
└─ users                                  # Auth.js identities (UUID PK)
├─ accounts (users.id)                 # OAuth accounts
├─ sessions (users.id)                 # optional DB sessions
└─ verification_tokens                 # passwordless and email flows (hashed)

└─ profiles (users.id)                    # user metadata; timezone, currency, settings

├─ api_keys (users.id, profiles.id?, workspaces.id?)  # hashed PATs + scopes
├─ subscriptions (profiles.id)            # Stripe linkage + slot_limit

├─ categories (profiles.id NULL=system)   # system tree when NULL; parent_id, slug

├─ workspaces (profiles.id owner)
│  ├─ workspace_members (workspaces.id, member_profile.id, role, scope_json)
│  ├─ saved_views (workspaces.id)
│  │  ├─ view_filters (saved_views.id)
│  │  ├─ view_sorts (saved_views.id)
│  │  ├─ view_group_by (saved_views.id)
│  │  ├─ view_rule_overrides (saved_views.id)
│  │  ├─ view_category_groups (saved_views.id)
│  │  ├─ view_shares (saved_views.id, profiles.id)
│  │  └─ view_links (saved_views.id)      # token_hash + passcode_hash + expiry
│  ├─ account_groups (workspaces.id)
│  │  └─ account_group_memberships (account_groups.id, accounts.id)
│  └─ workspace_connection_links          # workspace-scoped access to data
│     (workspaces.id, connections.id, granted_by_profile.id, account_scope_json, expires_at, revoked_at)

├─ budget_plans (workspaces.id, owner_profile.id)
│  ├─ budget_versions (budget_plans.id)
│  │  └─ budget_envelopes (budget_versions.id, category_id?)

├─ connections (profiles.id owner)
│  ├─ connection_sponsor_history (connections.id, from_profile.id, to_profile.id)
│  ├─ accounts (connections.id)
│  │  └─ transactions (accounts.id, connections.id)       # immutable base
│  │     ├─ transaction_overlays (transactions.id, profiles.id)
│  │     └─ transaction_audit_log (transactions.id, sync_sessions.id)
│  └─ sync_sessions (connections.id, initiator_profile.id)
│     ├─ session_page_payloads (sync_sessions.id)
│     ├─ session_idempotency (sync_sessions.id)
│     ├─ session_leases (sync_sessions.id)
│     └─ sync_audit_log (connections.id, sync_sessions.id?, user_id?)

└─ performance_caches (optional)
├─ user_connection_access_cache (user_id, connection_id, workspace_id?, account_scope_json)
└─ profile_transaction_access_cache (transaction.id, profile.id, workspace.id, connection.id, account.id)

---

4. Table Specs (Essential Fields)

Identity (Auth.js)
users

* id UUID PK, email TEXT UNIQUE, emailVerified TIMESTAMPTZ, name TEXT, image TEXT, password TEXT hashed if using credentials
  accounts
* id UUID PK, user_id FK users(id), provider TEXT, provider_account_id TEXT, refresh_token encrypted, access_token encrypted, expires_at TIMESTAMPTZ
* UNIQUE(provider, provider_account_id)
  sessions (optional if using DB sessions)
* id UUID PK, user_id FK users(id), session_token_hash TEXT UNIQUE, expires TIMESTAMPTZ
  verification_tokens
* identifier TEXT, token_hash TEXT UNIQUE, expires TIMESTAMPTZ

Profiles and Subscriptions
profiles

* id UUID PK, user_id FK users(id) UNIQUE, timezone TEXT, currency CHAR(3), settings JSONB, created_at, updated_at
  subscriptions
* id UUID PK, profile_id FK profiles(id), stripe_customer_id TEXT, stripe_subscription_id TEXT, slot_limit INT, status TEXT CHECK (status IN ('trialing','active','past_due','canceled','incomplete')), created_at, updated_at
* indexes on (profile_id), (status)

API Keys (PATs)
api_keys

* id UUID PK, user_id FK users(id), profile_id FK profiles(id) NULL, workspace_id FK workspaces(id) NULL
* name TEXT, key_hash TEXT UNIQUE, scopes JSONB DEFAULT '[]', last_used_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, created_at, updated_at
* CHECK (profile_id IS NOT NULL OR workspace_id IS NOT NULL)
* indexes on (user_id), (profile_id), (workspace_id), partial (revoked_at IS NULL)

Categories
categories

* id UUID PK, profile_id FK profiles(id) NULL, parent_id UUID NULL, slug TEXT, name TEXT, sort INT, created_at, updated_at, deleted_at
* UNIQUE (COALESCE(profile_id, '00000000-0000-0000-0000-000000000000'), slug) WHERE deleted_at IS NULL
* indexes on (parent_id)

Workspaces and Collaboration
workspaces

* id UUID PK, owner_profile_id FK profiles(id), name TEXT, settings JSONB, created_at, updated_at, deleted_at
  workspace_members
* id UUID PK, workspace_id FK, member_profile_id FK, role TEXT CHECK (role IN ('owner','admin','editor','viewer')), scope_json JSONB, created_at, updated_at
* UNIQUE(workspace_id, member_profile_id)
* GIN index on scope_json
  saved_views
* id UUID PK, workspace_id FK, name TEXT, is_default BOOL, created_at, updated_at, deleted_at
  view_filters, view_sorts, view_group_by, view_rule_overrides, view_category_groups
* id UUID PK, view_id FK, payload JSONB, created_at, updated_at
  view_shares
* id UUID PK, view_id FK, profile_id FK, can_edit BOOL, created_at, updated_at
  view_links
* id UUID PK, view_id FK, token_hash TEXT UNIQUE, passcode_hash TEXT NULL, expires_at TIMESTAMPTZ, created_by_profile_id FK, created_at, updated_at
* indexes on (view_id), (expires_at), partial (expires_at > now())
  account_groups
* id UUID PK, workspace_id FK, name TEXT, color TEXT, sort INT, created_at, updated_at, deleted_at
  account_group_memberships
* id UUID PK, group_id FK, account_id FK, created_at, updated_at
* UNIQUE(group_id, account_id)
  workspace_connection_links
* id UUID PK, workspace_id FK, connection_id FK, granted_by_profile_id FK, account_scope_json JSONB, expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, created_at, updated_at
* UNIQUE(workspace_id, connection_id) WHERE revoked_at IS NULL
* GIN index on account_scope_json

Budgets (Plans, Versions, Envelopes)
budget_plans

* id UUID PK, workspace_id FK, owner_profile_id FK, name TEXT, currency CHAR(3), rollup_mode TEXT CHECK (rollup_mode IN ('posted','authorized','both')), view_id FK saved_views(id) NULL, view_filter_snapshot JSONB, view_filter_hash TEXT, is_template BOOL DEFAULT false, created_at, updated_at, deleted_at
  budget_versions
* id UUID PK, plan_id FK, version_no INT, effective_from DATE, effective_to DATE NULL, period TEXT CHECK (period IN ('monthly','weekly','custom')), carryover_mode TEXT CHECK (carryover_mode IN ('none','envelope','surplus_only','deficit_only')), notes TEXT, created_at, updated_at
* UNIQUE(plan_id, version_no)
  budget_envelopes
* id UUID PK, version_id FK, category_id FK categories(id) NULL, label TEXT, limit_cents BIGINT NOT NULL, warn_at_pct INT DEFAULT 80, group_label TEXT NULL, metadata JSONB, created_at, updated_at
* indexes on (version_id), (category_id)
  budget_actuals_mv (materialized view)
* precomputed actuals per (version_id, envelope_id, period) applying snapshot or view filters and workspace scope

Connections, Accounts, Transactions
connections

* id UUID PK, owner_profile_id FK profiles(id), provider TEXT, provider_item_id TEXT, status TEXT CHECK (status IN ('active','paused','error','deleted')), tx_cursor TEXT, config JSONB, created_at, updated_at, deleted_at
* UNIQUE(provider, provider_item_id)
  connection_sponsor_history
* id UUID PK, connection_id FK, from_profile_id FK, to_profile_id FK, changed_at TIMESTAMPTZ DEFAULT now()
  accounts
* id UUID PK, connection_id FK, external_account_id TEXT, institution TEXT, subtype TEXT, mask TEXT, name TEXT, balance_cents BIGINT, currency CHAR(3), hidden BOOL DEFAULT false, created_at, updated_at, deleted_at
* UNIQUE(connection_id, external_account_id) WHERE deleted_at IS NULL
  transactions (append-only)
* id UUID PK, account_id FK, connection_id FK, provider_tx_id TEXT, posted_at TIMESTAMPTZ, authorized_at TIMESTAMPTZ NULL, amount_cents BIGINT NOT NULL, currency CHAR(3), merchant_raw TEXT, raw_payload JSONB, created_at
* UNIQUE(connection_id, provider_tx_id)
* indexes: (account_id, posted_at DESC), (posted_at DESC), GIN on raw_payload
  transaction_overlays
* id UUID PK, transaction_id FK, profile_id FK, category_id FK categories(id) NULL, notes TEXT, tags TEXT[] DEFAULT '{}', splits JSONB DEFAULT '[]', merchant_correction TEXT NULL, exclude BOOL DEFAULT false, created_at, updated_at, deleted_at
* UNIQUE(profile_id, transaction_id)
* GIN index on tags, optional GIN on splits
  transaction_audit_log
* id UUID PK, transaction_id FK, sync_session_id FK NULL, event TEXT, details JSONB, created_at TIMESTAMPTZ DEFAULT now()

Sync and Audit
sync_sessions

* id UUID PK, connection_id FK, initiator_profile_id FK, status TEXT CHECK (status IN ('queued','running','success','error')), started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ NULL, stats JSONB, created_at, updated_at
  session_page_payloads
* id UUID PK, sync_session_id FK, page_no INT, payload JSONB, expires_at TIMESTAMPTZ, created_at, updated_at
* partial index on (expires_at)
  session_idempotency
* id UUID PK, sync_session_id FK, idempotency_key TEXT UNIQUE, status TEXT, result_ref TEXT NULL, created_at, updated_at
  session_leases
* id UUID PK, sync_session_id FK, leased_until TIMESTAMPTZ, holder TEXT, created_at, updated_at
  sync_audit_log
* id UUID PK, connection_id FK, sync_session_id FK NULL, user_id FK users(id) NULL, event TEXT, meta JSONB, created_at TIMESTAMPTZ DEFAULT now()

Performance Caches (optional)
user_connection_access_cache

* user_id UUID, connection_id UUID, workspace_id UUID NULL, account_scope_json JSONB, created_at, updated_at
* GIN on account_scope_json
  profile_transaction_access_cache
* transaction_id UUID, profile_id UUID, workspace_id UUID, connection_id UUID, account_id UUID, created_at, updated_at

---

5. Deterministic Constraints (Must-Haves)

UNIQUE connections(provider, provider_item_id)
UNIQUE accounts(connection_id, external_account_id) WHERE deleted_at IS NULL
UNIQUE transactions(connection_id, provider_tx_id)
UNIQUE transaction_overlays(profile_id, transaction_id)
UNIQUE workspace_members(workspace_id, member_profile_id)
UNIQUE categories(COALESCE(profile_id, ZERO_UUID), slug) WHERE deleted_at IS NULL
UNIQUE budget_versions(plan_id, version_no)
UNIQUE view_links.token_hash (with active-only index for enforcement)
UNIQUE workspace_connection_links(workspace_id, connection_id) WHERE revoked_at IS NULL
CHECK api_keys requires at least one of profile_id or workspace_id

---

6. Index Strategy (Selected)

Time-sorted reads: transactions (account_id, posted_at DESC), sync_sessions (connection_id, started_at DESC)
JSONB GIN: scope_json, account_scope_json, config, raw_payload
Active-only partials: WHERE deleted_at IS NULL, WHERE revoked_at IS NULL, WHERE expires_at > now()
Search: optional pg_trgm on transactions.merchant_raw

---

7. Token and Secret Handling

Never store plaintext tokens or passcodes
PATs: api_keys.key_hash = sha256(token), show token once on creation
View links: store token_hash and passcode_hash, validate by hashing input
Sessions: store session_token_hash if using DB sessions; with JWT sessions, avoid DB lookups

---

8. RLS Approach

At request start in a single DB session or transaction, set:
SET LOCAL app.user_id = '<users.id>'
SET LOCAL app.profile_id = '<profiles.id>'
SET LOCAL app.workspace_id = '<workspaces.id or NULL>'

Example policies
connections: owner_profile_id = current_setting('app.profile_id')::uuid
workspace_members: member_profile_id = current_setting('app.profile_id')::uuid
transactions: visible if owned via connection.owner_profile_id OR scoped via an existing workspace_connection_links row for app.workspace_id and account_id present in account_scope_json

Prisma: wrap each request in a $transaction that issues SET LOCAL before queries

---

9. Data Integrity and Retention

Base transactions are append-only
Soft delete via deleted_at on user-generated tables
TTL sweeps for session_page_payloads.expires_at (30–90 days)
GDPR deletion via scripts traversing user and profile graphs

---

10. Migrations and Environments

Prisma Migrate in CI for dev, preview, prod; Neon branches for PR previews
Seeds: create profiles on signup, insert system categories (profile_id IS NULL)
Contract tests ensure API matches constraints; optional pgTAP for RLS

---

11. Budget Actuals (Computation Notes)

budget_actuals_mv materializes (version_id, envelope_id, period)
Resolve filters via view_id (live) or view_filter_snapshot (frozen)
Apply workspace_connection_links.account_scope_json
Sum transactions.amount_cents by posted date honoring rollup_mode
Refresh nightly and on relevant writes; index by (version_id, period)

---

12. Drop-in SQL Indexes and Checks (Examples)

CREATE UNIQUE INDEX uq_ws_conn_active
ON workspace_connection_links (workspace_id, connection_id)
WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX uq_categories_scoped_slug
ON categories (COALESCE(profile_id, '00000000-0000-0000-0000-000000000000'), slug)
WHERE deleted_at IS NULL;

ALTER TABLE api_keys
ADD CONSTRAINT api_keys_owner_ck
CHECK (profile_id IS NOT NULL OR workspace_id IS NOT NULL);

CREATE UNIQUE INDEX uq_tx_provider
ON transactions (connection_id, provider_tx_id);

CREATE INDEX ix_tx_account_posted
ON transactions (account_id, posted_at DESC);

CREATE UNIQUE INDEX uq_view_links_token_hash_active
ON view_links (token_hash)
WHERE expires_at > now();

---

13. Ready-for-Prod Checklist

UUIDs everywhere and FK types consistent
All unique constraints implemented as above
Hashes for PATs, view link tokens, passcodes, session tokens
BIGINT cents and currency fields set where money appears
GIN and partial indexes in place for JSONB and active rows
RLS policies wired and Prisma transactions issue SET LOCAL
Seed data for system categories and a default workspace
E2E tests for connection sharing, view links, overlays, and budget actuals

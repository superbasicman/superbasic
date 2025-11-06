SuperBasic Finance — Database Schema (Auth.js + Prisma 6 + Neon)

API-first, multi-tenant, append-only finance DB. Auth.js handles identity; domain logic keys off profiles.id. Transactions are immutable; edits live in overlays. Workspaces enable collaboration via scoped connection-links. All bearer tokens are hashed; provider secrets are encrypted. Enums use TEXT + CHECK to avoid migration pain.

---

1. Tech and Conventions

Engine: Postgres (Neon)
ORM: Prisma 6 (strict)
IDs: UUID v4 for all PKs (unify Auth.js adapter to UUID)
Timestamps: TIMESTAMPTZ with created_at DEFAULT now(); updated_at is managed by application layer/Prisma `@updatedAt` (no database DEFAULT)
Money: BIGINT amount_cents, currency VARCHAR(3) CHECK (char_length(currency) = 3)
JSON: JSONB with GIN indexes for scope/config/filter fields
Auth: Auth.js Prisma adapter (users, accounts, sessions, verification_tokens) with token hashes
RLS: current_setting('app.user_id'/'app.profile_id'/'app.workspace_id') set per request
Not-null discipline: all foreign keys (`*_id`), key/hash/status columns, and timestamps (created_at/updated_at) are declared NOT NULL with sensible defaults where applicable
Emails are stored and compared case-insensitively via lowercase canonical columns (e.g., users.email_lower)

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
   ├─ api_keys (users.id, profiles.id, workspaces.id?)  # hashed PATs + scopes
   ├─ subscriptions (profiles.id)         # Stripe linkage + slot_limit
   └─ categories (profiles.id NULL=system)             # system tree when NULL; parent_id, slug
      └─ profile_category_overrides (profiles.id, source_category_id, target_category_id)

├─ workspaces (profiles.id owner)
│  ├─ workspace_members (workspaces.id, member_profile.id, role, scope_json)
│  ├─ saved_views (workspaces.id)
│  │  ├─ view_filters (saved_views.id)
│  │  ├─ view_sorts (saved_views.id)
│  │  ├─ view_group_by (saved_views.id)
│  │  ├─ view_rule_overrides (saved_views.id)
│  │  ├─ view_category_groups (saved_views.id)
│  │  ├─ view_shares (saved_views.id, profiles.id)
│  │  ├─ view_links (saved_views.id)      # token_hash + passcode_hash + expiry
│  │  └─ view_category_overrides (saved_views.id, source_category_id, target_category_id)
│  ├─ account_groups (workspaces.id)
│  │  └─ account_group_memberships (account_groups.id, bank_accounts.id)
│  ├─ workspace_connection_links          # workspace-scoped access to data
│  │  (workspaces.id, connections.id, granted_by_profile.id, account_scope_json, expires_at, revoked_at)
│  ├─ workspace_allowed_accounts          # normalized scope when JSONB is insufficient
│  │  (workspaces.id, bank_accounts.id, granted_by_profile.id, created_at)
│  ├─ workspace_categories                # shared category tree
│  │  (workspaces.id, slug, name, parent_id?)
│  └─ workspace_category_overrides        # workspace-level remaps
│     (workspaces.id, source_category_id, target_category_id, scope)

├─ budget_plans (workspaces.id, owner_profile.id)
│  ├─ budget_versions (budget_plans.id)
│  │  └─ budget_envelopes (budget_versions.id, category_id?)

├─ connections (profiles.id owner)
│  ├─ connection_sponsor_history (connections.id, from_profile.id, to_profile.id)
│  ├─ bank_accounts (connections.id)
│  │  └─ transactions (bank_accounts.id, connections.id)  # immutable base
│  │     ├─ transaction_overlays (transactions.id, profiles.id)
│  │     └─ transaction_audit_log (transactions.id, sync_sessions.id)
│  └─ sync_sessions (connections.id, initiator_profile.id)
│     ├─ session_page_payloads (sync_sessions.id)
│     ├─ session_idempotency (sync_sessions.id)
│     ├─ session_leases (sync_sessions.id)
│     └─ sync_audit_log (connections.id, sync_sessions.id?, initiator_profile_id?)

└─ performance_caches (optional)
   ├─ user_connection_access_cache (profile_id, connection_id, workspace_id?, account_scope_json, user_id?)
   └─ profile_transaction_access_cache (transaction.id, profile.id, workspace.id, connection.id, account.id)

---

4. Table Specs (Essential Fields)

Identity (Auth.js)

users
* id UUID PK, email TEXT NOT NULL, email_lower TEXT NOT NULL UNIQUE, emailVerified TIMESTAMPTZ, name TEXT, image TEXT, password_hash TEXT, created_at, updated_at
* password_hash stores bcrypt hashes (e.g., cost 12+), never plaintext; column is NOT NULL when credentials login is enabled
* email_lower stores LOWER(email) and carries the uniqueness constraint (case-insensitive). Disallow NULL to avoid duplicate blanks.
* Optional non-unique index on email supports lookups by original casing without enforcing uniqueness twice; no extra UNIQUE index needed because `email_lower` already has one

accounts
* id UUID PK, user_id FK users(id), provider TEXT, provider_account_id TEXT, refresh_token encrypted, access_token encrypted, expires_at TIMESTAMPTZ
* UNIQUE(provider, provider_account_id)

sessions (optional if using DB sessions)
* id UUID PK, user_id FK users(id), session_token_hash JSONB UNIQUE, expires TIMESTAMPTZ
* index on (expires)
* TTL job purges expired rows to prevent unbounded growth

verification_tokens
* identifier TEXT, token_hash JSONB UNIQUE, expires TIMESTAMPTZ
* index on (expires)

Auth.js adapter access
* Auth.js flows run before a user/profile context exists. Keep these tables (users, accounts, sessions, verification_tokens) behind a dedicated database role (`auth_service`) with `BYPASSRLS`.
* Application traffic uses `app_user` with RLS; it never connects with `auth_service` credentials.
* Because of the pre-auth requirements, we do **not** enable RLS on the Auth.js tables. Security relies on hashed tokens, scoped application access, and the separation between `auth_service` and app roles.

Adapter alignment and verification
* Ensure the Prisma adapter models (`users`, `accounts`, `sessions`, `verification_tokens`) exactly mirror this contract:
  - UUID primary keys via `@default(uuid())` (or SQL `gen_random_uuid()`) plus `@db.Uuid`.
  - Canonical lowercase email column (`email_lower`) with a UNIQUE index; legacy `email` uniqueness must be dropped to avoid case collisions.
  - Timestamp columns declared as `TIMESTAMPTZ`, using Prisma `@default(now())` for `created_at` and `@updatedAt` for `updated_at`.
  - Token material stored only as digests: `sessions.session_token_hash` and `verification_tokens.token_hash`. Remove any plaintext `sessionToken`/`token` columns during the migration and backfill the hashes.
* Update Auth.js configuration to:
  - Use the UUID primary keys surfaced by Prisma (set `adapter: PrismaAdapter(prisma)` and provide a custom `createUser` that populates `email_lower`).
  - Hash tokens before persistence (override `session` / `verificationToken` adapter methods if necessary so only digests reach the database).
* Add integration coverage in `packages/auth` that provisions a Neon preview database and exercises the full flow matrix:
  - Email/password sign-up, OAuth login, passwordless email magic link, and email verification.
  - Each test asserts UUID primary keys, non-null `email_lower`, hashed token columns populated, and absence of plaintext token values.
  - Tests run via `pnpm test --filter auth -- --run` in CI with DATABASE_URL pointing at the disposable Neon branch.

Profiles and Subscriptions

profiles
* id UUID PK, user_id FK users(id) UNIQUE, timezone TEXT, currency VARCHAR(3) CHECK (char_length(currency) = 3), settings JSONB, created_at, updated_at
* One profile per Auth.js user (v1 assumption). Supporting multiple profiles per user later will require dropping the UNIQUE constraint and adding application-level semantics (e.g., primary_profile_id).

subscriptions
* id UUID PK, profile_id FK profiles(id), stripe_customer_id TEXT, stripe_subscription_id TEXT, slot_limit INT, status TEXT CHECK (status IN ('trialing','active','past_due','canceled','incomplete')), created_at, updated_at
* indexes on (profile_id), (status)

API Keys (PATs)

api_keys
* id UUID PK, user_id FK users(id), profile_id FK profiles(id) NOT NULL, workspace_id FK workspaces(id) NULL
* name TEXT, key_hash JSONB UNIQUE, scopes JSONB DEFAULT '[]', last_used_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, created_at, updated_at
* CHECK (profile_id IS NOT NULL)
* Keys are always owned by a profile; they may be personal (workspace_id NULL) or workspace-scoped (workspace_id present). When a member is removed from a workspace, revoke any associated keys in the same transaction to avoid dangling access.
* DEFERRABLE INITIALLY DEFERRED constraint trigger (`api_keys_validate_profile_link`) asserts that any provided profile_id belongs to the same user_id.
* DEFERRABLE INITIALLY DEFERRED constraint trigger (`api_keys_validate_workspace_link`) asserts that workspace_id (when present) has a workspace_members row for the profile with role IN ('owner','admin').
* indexes on (user_id), (profile_id), (workspace_id), partial (revoked_at IS NULL)
* key_hash stores JSON metadata `{ "algo": "hmac-sha256", "key_id": "v1", "hash": "<base64>" }`; prefer JSONB to allow querying for stale algorithms during rotations.

Categories and Overrides

categories
* id UUID PK, profile_id FK profiles(id) NULL, parent_id UUID NULL REFERENCES categories(id) DEFERRABLE INITIALLY DEFERRED, slug TEXT, name TEXT, sort INT, created_at, updated_at, deleted_at
* UNIQUE (COALESCE(profile_id, '00000000-0000-0000-0000-000000000000'), slug) WHERE deleted_at IS NULL
* indexes on (parent_id)
* profile_id IS NULL rows represent system defaults shared across workspaces; non-null profile_id rows remain private to their owners
* Seed data must include a canonical `uncategorized` system category; ingestion maps missing provider data to this slug instead of leaving transactions.system_category_id NULL.
* Shared category trees live in workspace_categories (see Workspaces)
* Constraint trigger enforces parent.child profile consistency (system roots can only parent other system nodes)

profile_category_overrides
* id UUID PK, profile_id FK profiles(id), source_category_id FK categories(id), target_category_id FK categories(id) NULL, created_at, updated_at, deleted_at
* UNIQUE(profile_id, source_category_id) WHERE deleted_at IS NULL
* target_category_id can reference system categories (profile_id NULL) or profile-owned categories

Workspaces and Collaboration

workspaces
* id UUID PK, owner_profile_id FK profiles(id), name TEXT, settings JSONB, created_at, updated_at, deleted_at
* settings.default_currency defines the workspace base currency; v1 workflows expect budgets to use this currency

workspace_members
* id UUID PK, workspace_id FK, member_profile_id FK, role TEXT CHECK (role IN ('owner','admin','editor','viewer')), scope_json JSONB, created_at, updated_at
* UNIQUE(workspace_id, member_profile_id)
* GIN index on scope_json
* Role semantics (enforced via app logic + RLS guards):
  - owner: full control (manage members, connections, budgets, views, billing)
  - admin: manage connections, views, budgets; invite/remove non-owners
  - editor: read/write data (transaction overlays, budgets, views) but cannot change membership or billing
  - viewer: read-only access scoped by workspace_connection_links/account scopes
* RLS policies rely on role checks at the application layer before issuing queries; viewer paths receive read policies only

saved_views
* id UUID PK, workspace_id FK, name TEXT, is_default BOOL, created_at, updated_at, deleted_at

view_filters, view_sorts, view_group_by, view_rule_overrides, view_category_groups
* id UUID PK, view_id FK, payload JSONB, created_at, updated_at

view_shares
* id UUID PK, view_id FK, profile_id FK, can_edit BOOL, created_at, updated_at

  view_links
* id UUID PK, view_id FK, token_hash JSONB UNIQUE, passcode_hash JSONB NULL, expires_at TIMESTAMPTZ, created_by_profile_id FK, created_at, updated_at
* indexes on (view_id), (expires_at)
* Links are anonymous, read-only entry points; requests execute under a constrained workspace context with audit logging of link usage
* TTL job revokes and purges expired links regularly

view_category_overrides
* id UUID PK, view_id FK saved_views(id), source_category_id FK workspace_categories(id) NULL, target_category_id FK workspace_categories(id) NULL, system_source_category_id FK categories(id) NULL, system_target_category_id FK categories(id) NULL, created_at, updated_at, deleted_at
* UNIQUE(view_id, COALESCE(source_category_id, system_source_category_id)) WHERE deleted_at IS NULL
* CHECK constraint enforces that exactly one of (source_category_id, system_source_category_id) is non-null, and exactly one of (target_category_id, system_target_category_id) is non-null

account_groups
* id UUID PK, workspace_id FK, name TEXT, color TEXT, sort INT, created_at, updated_at, deleted_at

account_group_memberships
* id UUID PK, group_id FK, account_id FK bank_accounts(id), created_at, updated_at
* UNIQUE(group_id, account_id)

workspace_connection_links
* id UUID PK, workspace_id FK, connection_id FK, granted_by_profile_id FK, account_scope_json JSONB, expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, created_at, updated_at
* UNIQUE(workspace_id, connection_id) WHERE revoked_at IS NULL
* GIN index on account_scope_json
* account_scope_json contract: NULL = all accounts on the connection; otherwise a JSONB array of bank_accounts.id strings (validated via CHECK or trigger)
* deterministic helper function unwraps via jsonb_array_elements_text
* expires_at NULL means “until revoked”; when set, link becomes inactive once expires_at <= now() even if revoked_at is still NULL
* Constraint trigger validates JSON shape and that every account belongs to the referenced connection/workspace

  workspace_allowed_accounts (optional normalization)
* id UUID PK, workspace_id FK, bank_account_id FK bank_accounts(id), granted_by_profile_id FK, created_at, revoked_at
* UNIQUE(workspace_id, bank_account_id) WHERE revoked_at IS NULL

workspace_categories
* id UUID PK, workspace_id FK, parent_id UUID NULL REFERENCES workspace_categories(id) DEFERRABLE INITIALLY DEFERRED, slug TEXT, name TEXT, sort INT, created_at, updated_at, deleted_at, color TEXT NULL
* UNIQUE(workspace_id, slug) WHERE deleted_at IS NULL
* indexes on (workspace_id, parent_id)
* Constraint trigger ensures parent workspace_id matches child workspace_id

workspace_category_overrides
* id UUID PK, workspace_id FK, source_category_id FK workspace_categories(id) NULL, target_category_id FK workspace_categories(id) NULL, system_source_category_id FK categories(id) NULL, system_target_category_id FK categories(id) NULL, created_at, updated_at, deleted_at
* UNIQUE(workspace_id, COALESCE(source_category_id, system_source_category_id)) WHERE deleted_at IS NULL
* CHECK constraint enforces that exactly one of (source_category_id, system_source_category_id) is non-null, and exactly one of (target_category_id, system_target_category_id) is non-null

Overlay precedence (canonical across UI + reports): transaction overlays → view overrides → workspace overrides → profile overrides → base system mapping.

Budgets (Plans, Versions, Envelopes)

budget_plans
* id UUID PK, workspace_id FK, owner_profile_id FK, name TEXT, currency VARCHAR(3) CHECK (char_length(currency) = 3), rollup_mode TEXT CHECK (rollup_mode IN ('posted','authorized','both')), view_id FK saved_views(id) NULL, view_filter_snapshot JSONB, view_filter_hash TEXT, is_template BOOL DEFAULT false, created_at, updated_at, deleted_at
* Constraint trigger (`budget_plans_enforce_currency`, BEFORE INSERT/UPDATE) ensures currency matches workspace.settings->>'default_currency'; mixed-currency plans are not supported yet

budget_versions
* id UUID PK, plan_id FK, version_no INT, effective_from DATE, effective_to DATE NULL, period TEXT CHECK (period IN ('monthly','weekly','custom')), carryover_mode TEXT CHECK (carryover_mode IN ('none','envelope','surplus_only','deficit_only')), notes TEXT, created_at, updated_at
* UNIQUE(plan_id, version_no)

budget_envelopes
* id UUID PK, version_id FK, category_id FK categories(id) NULL, label TEXT, limit_cents BIGINT NOT NULL, warn_at_pct INT DEFAULT 80, group_label TEXT NULL, metadata JSONB, created_at, updated_at
* indexes on (version_id), (category_id)

budget_actuals (materialized table refreshed via job)
* precomputed actuals per (plan_id, version_id, envelope_id, period) applying snapshot or view filters and workspace scope
* Maintained by a refresh job that truncates/reinserts; exposed to the app either directly or via a thin view `budget_actuals_mv` that simply `SELECT * FROM budget_actuals`
* Schema includes plan_id, version_id, envelope_id, period (DATE), currency (VARCHAR(3)), rollup_mode (TEXT), posted_amount_cents, authorized_amount_cents, workspace_category_id (UUID NULL), updated_at TIMESTAMPTZ
* Constraint trigger `budget_plans_enforce_currency` keeps plan currencies aligned with `workspaces.settings->>'default_currency'`; mismatches raise immediately
* Refresh pipeline (`tooling/scripts/refresh-budget-actuals.ts`) runs nightly and after envelope/transaction writes; it honours version.rollup_mode and skips non-matching currencies until FX support exists
* Aggregation respects account scoping via the same helpers as transaction RLS (`workspace_connection_links.account_scope_json`, membership checks) so unauthorized accounts never contribute
* Indexes required: `CREATE INDEX budget_actuals_version_period_idx ON budget_actuals(version_id, period);` and `CREATE INDEX budget_actuals_plan_version_period_idx ON budget_actuals(plan_id, version_id, period);`
* CROSS JOIN LATERAL effective_workspace_category(transaction_id, workspace_id, view_id) to fold in system + workspace/view overrides while staying profile-agnostic
* Profile overlays and overrides are resolved at query time via effective_transaction_category(...) when presenting personalized views
* Denormalize plan_id so RLS checks avoid extra joins and stay aligned with workspace membership
* Postgres cannot enforce RLS on materialized views; keep policies on this table and treat any view as a passthrough alias

Connections, Bank Accounts, Transactions

connections
* id UUID PK, owner_profile_id FK profiles(id), provider TEXT, provider_item_id TEXT, status TEXT CHECK (status IN ('active','paused','error','deleted')), tx_cursor TEXT, config JSONB, created_at, updated_at, deleted_at
* UNIQUE(provider, provider_item_id)
* provider_item_id = Plaid item_id when provider = 'plaid'; tx_cursor stores provider sync cursor
* config holds non-secret provider metadata only; encrypted Plaid access tokens and other secrets live in encrypted columns or a connection_secrets table

connection_sponsor_history
* id UUID PK, connection_id FK, from_profile_id FK, to_profile_id FK, changed_at TIMESTAMPTZ DEFAULT now()
* Append-only audit log: insert initial row on creation (from_profile_id NULL) and on each transfer; connections.owner_profile_id remains source of truth
* Index (connection_id, changed_at DESC) recommended for fast “latest sponsor” queries

bank_accounts
* id UUID PK, connection_id FK, external_account_id TEXT, institution TEXT, subtype TEXT, mask TEXT, name TEXT, balance_cents BIGINT, currency VARCHAR(3) CHECK (char_length(currency) = 3), hidden BOOL DEFAULT false, created_at, updated_at, deleted_at
* UNIQUE(connection_id, external_account_id) WHERE deleted_at IS NULL
* UNIQUE(id, connection_id) to back composite FK usage

transactions (append-only)
* id UUID PK, account_id FK bank_accounts(id), connection_id FK, provider_tx_id TEXT NOT NULL, posted_at TIMESTAMPTZ, authorized_at TIMESTAMPTZ NULL, amount_cents BIGINT NOT NULL, currency VARCHAR(3) CHECK (char_length(currency) = 3), system_category_id UUID NULL REFERENCES categories(id), merchant_raw TEXT, raw_payload JSONB, created_at
* FK (account_id, connection_id) REFERENCES bank_accounts(id, connection_id)
* UNIQUE(connection_id, provider_tx_id)
* system_category_id defaults to the seeded system `uncategorized` category; a NULL value signals ingestion debt and the resolver will surface `category_id = NULL` unless an overlay exists.
* fallback: when providers omit IDs, derive provider_tx_id via sha256(connection_id || posted_at || amount_cents || merchant_raw)
* indexes: (account_id, posted_at DESC), (posted_at DESC), GIN on raw_payload
* append-only: guarded by triggers preventing UPDATE/DELETE; app role lacks UPDATE/DELETE privileges on this table

transaction_overlays
* id UUID PK, transaction_id FK, profile_id FK, category_id FK categories(id) NULL, notes TEXT, tags TEXT[] DEFAULT '{}', splits JSONB DEFAULT '[]', merchant_correction TEXT NULL, exclude BOOL DEFAULT false, created_at, updated_at, deleted_at
* UNIQUE(profile_id, transaction_id)
* GIN index on tags, optional GIN on splits
* partial indexes on profile_id and transaction_id scoped to deleted_at IS NULL for fast overlay lookups
* BEFORE trigger validate_transaction_overlay_splits enforces JSON shape and sum-equals-base rules
* category_id must reference categories.id (system or profile-owned). Workspace-specific labeling flows through workspace_category_overrides and view overrides rather than direct FKs from overlays.
* Overlays represent per-transaction exceptions and override the category resolver for that row only

transaction_audit_log
* id UUID PK, transaction_id FK, sync_session_id FK NULL, event TEXT, details JSONB, created_at TIMESTAMPTZ DEFAULT now()

Sync and Audit

sync_sessions
* id UUID PK, connection_id FK, initiator_profile_id FK, status TEXT CHECK (status IN ('queued','running','success','error')), started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ NULL, stats JSONB, created_at, updated_at
* Status transitions: queued → running → success/error; retries require previous session to complete or be marked error after lease expiry

session_page_payloads
* id UUID PK, sync_session_id FK, page_no INT, payload JSONB, expires_at TIMESTAMPTZ, created_at, updated_at
* partial index on (expires_at)
* TTL job deletes expired payload rows and associated blobs

session_idempotency
* id UUID PK, sync_session_id FK, idempotency_key TEXT UNIQUE, status TEXT, result_ref TEXT NULL, created_at, updated_at

session_leases
* id UUID PK, sync_session_id FK, leased_until TIMESTAMPTZ, holder TEXT, created_at, updated_at
* Leases ensure a single worker processes a session; new workers may take over once leased_until passes, at which point prior work is considered abandoned and session status should transition accordingly

sync_audit_log
* id UUID PK, connection_id FK, sync_session_id FK NULL, initiator_profile_id FK profiles(id) NULL, event TEXT, meta JSONB, created_at TIMESTAMPTZ DEFAULT now()
* initiator_profile_id captures the acting profile when the event is user-driven; system/worker events may leave it NULL

Syncs run per connection; any resulting transactions automatically surface to workspaces with active workspace_connection_links or workspace_allowed_accounts coverage for the affected accounts.
Recovering stuck sessions: if leased_until expires without completion, mark session status 'error' (or retry) and create a new session with a fresh lease; workers must release leases on success/failure.

Performance Caches (optional)

user_connection_access_cache
* profile_id UUID, connection_id UUID, workspace_id UUID NULL, account_scope_json JSONB, user_id UUID NULL, created_at, updated_at
* GIN on account_scope_json
* UNIQUE(profile_id, connection_id, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid))
* user_id is optional and used only for audit/debug; all access control logic keys off profile_id/workspace_id
* Protected via RLS mirroring connection/workspace policies so the app role cannot read outside scope

profile_transaction_access_cache
* transaction_id UUID, profile_id UUID, workspace_id UUID NULL, connection_id UUID, account_id UUID, created_at, updated_at
* UNIQUE(transaction_id, profile_id, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid))
* workspace_id NULL represents profile-wide (all-workspace) cache entries; workspace-specific rows store the concrete workspace UUID
* RLS mirrors transactions: rows are visible only when the session GUCs prove profile ownership and, when workspace_id is not NULL, membership in that workspace

Both caches derive from deterministic queries and are safe to truncate when invalidated.

---

Category Resolution Order

Effective category lookups use the helper below so every API/UI query and `budget_actuals` (or its thin `budget_actuals_mv` view) share identical precedence rules:
1. transaction_overlays.category_id (per-transaction exceptions, always referencing categories.id)
2. view_category_overrides (active saved view scope, may point to workspace_categories or categories)
3. workspace_category_overrides (workspace-level remaps)
4. profile_category_overrides (profile-level remaps)
5. transactions.system_category_id (ingestion + Plaid mapping baseline)

Each override only triggers when its `source_category_id`/`system_source_category_id` matches the category currently in scope (system or workspace); otherwise the resolver skips that row and continues down the stack. Workspace-scoped `source_category_id` rules only fire after a prior override has produced a non-null `current_workspace_category`.
- If a transaction reaches this resolver with `system_category_id IS NULL`, the functions return `(NULL,NULL,'system_mapping')`. Treat this as a data hygiene issue—ingestion must backfill the seeded system `uncategorized` category or apply an overlay; overrides do not attempt to match NULL.
- Profile overrides intentionally clear `current_workspace_category` so downstream callers know the final category is profile-specific.

Performance guidance:
- For high-volume analytics (budget refreshes, exports), prefer direct joins against the override tables using the precedence below instead of invoking these functions per-row.
- Keep covering indexes on `view_category_overrides(view_id, system_source_category_id, deleted_at)`, `(view_id, source_category_id, deleted_at)`, `workspace_category_overrides(workspace_id, system_source_category_id, deleted_at)`, `(workspace_id, source_category_id, deleted_at)`, and `profile_category_overrides(profile_id, source_category_id, deleted_at)` so both the UDFs and join-based plans stay efficient.
- Add pgTAP property tests that compare this UDF to an equivalent SQL join implementation across randomized override configurations to prevent future regressions.

CREATE OR REPLACE FUNCTION effective_transaction_category(
  p_transaction_id uuid,
  p_profile_id uuid,
  p_workspace_id uuid DEFAULT NULL,
  p_view_id uuid DEFAULT NULL
)
RETURNS TABLE (
  category_id uuid,
  workspace_category_id uuid,
  source text
) AS $$
DECLARE
  current_category uuid;
  current_workspace_category uuid;
  last_source text := 'system_mapping';
  overlay_category uuid;
  view_target_category uuid;
  view_target_workspace uuid;
  workspace_target_category uuid;
  workspace_target_workspace uuid;
  profile_target_category uuid;
BEGIN
  SELECT o.category_id
  INTO overlay_category
  FROM transaction_overlays o
  WHERE o.transaction_id = p_transaction_id
    AND o.profile_id = p_profile_id
    AND o.deleted_at IS NULL
  LIMIT 1;

  IF overlay_category IS NOT NULL THEN
    current_category := overlay_category;
    current_workspace_category := NULL; -- workspace category context only appears once an override sets it
    last_source := 'overlay';
  ELSE
    -- No overlay: begin at system mapping baseline
    SELECT t.system_category_id
    INTO current_category
    FROM transactions t
    WHERE t.id = p_transaction_id;
    current_workspace_category := NULL;
    last_source := 'system_mapping';
  END IF;

  IF p_view_id IS NOT NULL AND current_category IS NOT NULL THEN
    -- Layer 2: view overrides (per saved view)
    SELECT
      CASE
        WHEN vco.system_target_category_id IS NOT NULL THEN vco.system_target_category_id
        ELSE current_category
      END,
      vco.target_category_id
    INTO view_target_category, view_target_workspace
    FROM view_category_overrides vco
    JOIN saved_views sv ON sv.id = vco.view_id
    JOIN workspace_members wm
      ON wm.workspace_id = sv.workspace_id
     AND wm.member_profile_id = p_profile_id
    WHERE vco.view_id = p_view_id
      AND vco.deleted_at IS NULL
      AND (
        (vco.system_source_category_id IS NOT NULL AND vco.system_source_category_id = current_category)
        OR (vco.source_category_id IS NOT NULL AND vco.source_category_id = current_workspace_category)
      )
    LIMIT 1;

    IF FOUND THEN
      current_category := view_target_category;
      current_workspace_category := view_target_workspace;
      last_source := 'view_override';
    END IF;
  END IF;

  IF p_workspace_id IS NOT NULL AND current_category IS NOT NULL THEN
    -- Layer 3: workspace-level overrides
    SELECT
      CASE
        WHEN wco.system_target_category_id IS NOT NULL THEN wco.system_target_category_id
        ELSE current_category
      END,
      wco.target_category_id
    INTO workspace_target_category, workspace_target_workspace
    FROM workspace_category_overrides wco
    WHERE wco.workspace_id = p_workspace_id
      AND wco.deleted_at IS NULL
      AND (
        (wco.system_source_category_id IS NOT NULL AND wco.system_source_category_id = current_category)
        OR (wco.source_category_id IS NOT NULL AND wco.source_category_id = current_workspace_category)
      )
    LIMIT 1;

    IF FOUND THEN
      current_category := workspace_target_category;
      current_workspace_category := workspace_target_workspace;
      last_source := 'workspace_override';
    END IF;
  END IF;

  IF current_category IS NOT NULL THEN
    -- Layer 4: profile overrides (final user-specific remap)
    SELECT pco.target_category_id
    INTO profile_target_category
    FROM profile_category_overrides pco
    WHERE pco.profile_id = p_profile_id
      AND pco.deleted_at IS NULL
      AND pco.source_category_id = current_category
    LIMIT 1;

    IF FOUND THEN
      current_category := profile_target_category;
      current_workspace_category := NULL;
      last_source := 'profile_override';
    END IF;
  END IF;

  RETURN QUERY
  SELECT current_category, current_workspace_category, last_source;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION effective_workspace_category(
  p_transaction_id uuid,
  p_workspace_id uuid,
  p_view_id uuid DEFAULT NULL
)
RETURNS TABLE (
  category_id uuid,
  workspace_category_id uuid,
  source text
) AS $$
DECLARE
  current_category uuid;
  current_workspace_category uuid;
  last_source text := 'system_mapping';
  view_target_category uuid;
  view_target_workspace uuid;
  workspace_target_category uuid;
  workspace_target_workspace uuid;
BEGIN
  SELECT t.system_category_id
  INTO current_category
  FROM transactions t
  WHERE t.id = p_transaction_id;

  current_workspace_category := NULL;

  IF p_view_id IS NOT NULL THEN
    -- View overrides sit on top of system mapping for workspace projections
    SELECT
      CASE
        WHEN vco.system_target_category_id IS NOT NULL THEN vco.system_target_category_id
        ELSE current_category
      END,
      vco.target_category_id
    INTO view_target_category, view_target_workspace
    FROM saved_views sv
    JOIN view_category_overrides vco ON vco.view_id = sv.id
    WHERE sv.id = p_view_id
      AND sv.workspace_id = p_workspace_id
      AND vco.deleted_at IS NULL
      AND (
        (vco.system_source_category_id IS NOT NULL AND vco.system_source_category_id = current_category)
        OR (vco.source_category_id IS NOT NULL AND vco.source_category_id = current_workspace_category)
      )
    LIMIT 1;

    IF FOUND THEN
      current_category := view_target_category;
      current_workspace_category := view_target_workspace;
      last_source := 'view_override';
    END IF;
  END IF;

  IF p_workspace_id IS NOT NULL THEN
    -- Workspace overrides finalize the category for aggregates
    SELECT
      CASE
        WHEN wco.system_target_category_id IS NOT NULL THEN wco.system_target_category_id
        ELSE current_category
      END,
      wco.target_category_id
    INTO workspace_target_category, workspace_target_workspace
    FROM workspace_category_overrides wco
    WHERE wco.workspace_id = p_workspace_id
      AND wco.deleted_at IS NULL
      AND (
        (wco.system_source_category_id IS NOT NULL AND wco.system_source_category_id = current_category)
        OR (wco.source_category_id IS NOT NULL AND wco.source_category_id = current_workspace_category)
      )
    LIMIT 1;

    IF FOUND THEN
      current_category := workspace_target_category;
      current_workspace_category := workspace_target_workspace;
      last_source := 'workspace_override';
    END IF;
  END IF;

  RETURN QUERY
  SELECT current_category, current_workspace_category, last_source;
END;
$$ LANGUAGE plpgsql STABLE;

Profile-aware query helpers should CROSS JOIN LATERAL `effective_transaction_category(t.id, current_setting('app.profile_id', true)::uuid, current_setting('app.workspace_id', true)::uuid, :view_id)` to fetch `(category_id, workspace_category_id, source)` per requester. Workspace-wide aggregates (e.g., `budget_actuals`) should instead call `effective_workspace_category(t.id, workspace_id, :view_id)` and keep per-profile overlays outside the materialized data.

---

5. Deterministic Constraints (Must-Haves)

UNIQUE connections(provider, provider_item_id)
UNIQUE bank_accounts(connection_id, external_account_id) WHERE deleted_at IS NULL
UNIQUE bank_accounts(id, connection_id)
UNIQUE transactions(connection_id, provider_tx_id)
UNIQUE transaction_overlays(profile_id, transaction_id)
UNIQUE workspace_members(workspace_id, member_profile_id)
UNIQUE categories(COALESCE(profile_id, ZERO_UUID), slug) WHERE deleted_at IS NULL
UNIQUE profile_category_overrides(profile_id, source_category_id) WHERE deleted_at IS NULL
UNIQUE budget_versions(plan_id, version_no)
UNIQUE view_links.token_hash
UNIQUE workspace_connection_links(workspace_id, connection_id) WHERE revoked_at IS NULL
UNIQUE workspace_allowed_accounts(workspace_id, bank_account_id) WHERE revoked_at IS NULL
UNIQUE workspace_categories(workspace_id, slug) WHERE deleted_at IS NULL
UNIQUE workspace_category_overrides(workspace_id, COALESCE(source_category_id, system_source_category_id)) WHERE deleted_at IS NULL
UNIQUE view_category_overrides(view_id, COALESCE(source_category_id, system_source_category_id)) WHERE deleted_at IS NULL
CHECK api_keys enforce profile ownership (profile_id IS NOT NULL; workspace membership validated via trigger)
Constraint triggers on api_keys enforce cross-column alignment (profile_id ↔ profiles.user_id, workspace membership for workspace_id)

Not-null guarantees and soft-delete hygiene
- Every foreign key (`*_id`), hash/status column, and timestamp adheres to `NOT NULL` — append-only tables (e.g., `transactions`, `transaction_audit_log`) omit `updated_at` but retain `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- Soft-delete fields (`deleted_at`, `revoked_at`) default to NULL and must be referenced in partial indexes (`WHERE deleted_at IS NULL`, `WHERE revoked_at IS NULL`) and RLS predicates to keep inactive rows out of hot paths.
- Add CI coverage (`tooling/scripts/check-not-null.ts`) that selects nullable columns from `information_schema.columns` and fails if any monitored FK/timestamp/hash/status field drifts from the contract.
- Pair the nullability check with an index audit (`tooling/scripts/check-partial-indexes.ts`) ensuring every partial index guarding active rows matches the documented soft-delete column.

Foreign Key Delete Semantics (Hard Requirements)
- Soft-delete-first parents (`profiles`, `workspaces`, `connections`, `bank_accounts`, `categories`, `workspace_categories`) keep their children via `ON DELETE RESTRICT`; application workflows toggle `deleted_at` instead of hard deletes.
- Category tree + overrides: `categories.parent_id`, `profile_category_overrides.*`, `workspace_categories.parent_id`, `workspace_category_overrides.*`, `view_category_overrides.*` all use `ON DELETE RESTRICT` so taxonomy history is preserved until matching soft deletes run.
- Budget hierarchy: `budget_versions.plan_id` and `budget_envelopes.version_id` stay `ON DELETE RESTRICT`; plans/envelopes are archived via `deleted_at`.
- Append-only ledger: `transaction_overlays.transaction_id`, `transaction_overlays.profile_id`, and `transaction_audit_log.transaction_id` must be `ON DELETE RESTRICT` because transactions never hard-delete.
- Workspace collateral (`workspace_members`, `workspace_connection_links`, `workspace_allowed_accounts`, `view_*`, `saved_views`) rely on `ON DELETE RESTRICT` to keep soft-deletion semantics coherent.
- Sync session fan-out: `session_page_payloads.sync_session_id`, `session_idempotency.sync_session_id`, `session_leases.sync_session_id`, `sync_audit_log.sync_session_id` (when present) use `ON DELETE CASCADE` so pruning a `sync_session` clears its dependent rows. The parent FK `sync_sessions.connection_id` remains `ON DELETE RESTRICT`.
- Cache tables (`user_connection_access_cache`, `profile_transaction_access_cache`) prefer `ON DELETE CASCADE` on their foreign keys to avoid stale rows when profiles/workspaces/connections are purged.
- Update every migration/SQL snippet to declare the intended `ON DELETE ...` explicitly; never rely on the default `NO ACTION`.

---

6. Index Strategy (Selected)

Time-sorted reads:
- transactions (account_id, posted_at DESC)
- sync_sessions (connection_id, started_at DESC)

JSONB GIN:
- scope_json, account_scope_json, config, raw_payload

Active-only partials:
- WHERE deleted_at IS NULL
- WHERE revoked_at IS NULL

Long-range scans:
- BRIN on transactions(posted_at) for archive/reporting queries

JSON containment heavy paths:
- consider jsonb_path_ops GIN for fields queried via @>

Overlay lookups:
- partial indexes on transaction_overlays(profile_id) and (transaction_id) WHERE deleted_at IS NULL

Workspace scopes:
- index workspace_members(workspace_id, member_profile_id, role)
- index workspace_allowed_accounts(workspace_id, bank_account_id, revoked_at)
- index workspace_connection_links(workspace_id, connection_id, revoked_at, expires_at)

Workspace categories:
- index workspace_categories(workspace_id, parent_id) for tree traversals

Overrides:
- unique indexes enforce deterministic remaps at profile/workspace/view scopes

Search:
- optional pg_trgm on transactions.merchant_raw

GIN / JSONB cost tuning:
- Benchmark realistic write loads on a Neon preview branch (e.g., `tooling/scripts/seed-demo.ts --writes=heavy`) and sample `pg_stat_wal`, `pg_stat_statements`, and `pg_stat_all_indexes` before/after to capture WAL bytes/minute, checkpoint churn, and average write latency.
- Focus on tables with stacked GIN indexes (`workspace_members.scope_json`, `workspace_connection_links.account_scope_json`, `workspace_allowed_accounts.account_scope_json`, `connections.config`, `sync_sessions.raw_payload`, `transaction_overlays.tags/splits`). WAL growth over baseline should stay within a 20% budget; otherwise trim indexes.
- Pair the write test with targeted JSONB query plans (`EXPLAIN (ANALYZE, BUFFERS)` using production predicates) to confirm each GIN index yields measurable latency or buffer savings.
- Reconfigure or drop low-value indexes: switch to `USING GIN (column jsonb_path_ops)` when predicates rely on `@>` containment, or add partial filters (`WHERE revoked_at IS NULL`, `WHERE deleted_at IS NULL`) so cold/archive rows stop accruing maintenance cost.
- Capture results in `tooling/scripts/validate-gin-costs.ts` and gate merges via `pnpm db:gin-validate` so new JSONB indexes run through the same WAL + latency regression checks.

---

7. Token and Secret Handling

Never store plaintext tokens or passcodes.

Canonical token envelope
* All generated tokens follow `<token_id>.<token_secret>`; token_id is a UUID v4 stored in plaintext columns (`*_id`, `token_id`) for lookups.
* `_hash` columns persist structured JSONB `{ "algo": "hmac-sha256", "key_id": "v1", "hash": "<base64>" }` so we can rotate algorithms/keys without rewriting callers. Column DDL must use `JSONB` (not TEXT) to keep operators available.
* Generator helpers must record `issued_at` and optional `salt` metadata inside the JSON payload when future rotation requires it.

One-way hashes:
- api_keys.key_hash (stores HMAC digest + metadata)
- view_links.token_hash / passcode_hash (shared format + metadata)
- sessions.session_token_hash (if DB-backed)
- verification_tokens.token_hash (shared format + metadata)

Token hashing:
- All token-like secrets (API keys, view links, sessions, verification tokens) use a shared format of `token_id`.`token_secret`; only the token_id (uuid) is stored in plaintext.
- The token_secret is hashed via HMAC-SHA-256 with a server-side key and per-token salt; store algorithm/parameters alongside hashes to support rotation.
- Example columns: `api_keys.key_hash`, `view_links.token_hash`, `sessions.session_token_hash`, `verification_tokens.token_hash` include metadata columns where appropriate.

Tokens are shown exactly once; verification recomputes the HMAC and compares timing-safely against the stored digest.

Encrypted secrets:
- provider credentials (e.g., Plaid access tokens, processor tokens, webhook secrets) are encrypted at rest using application KMS helpers
- stored either in connections.config (encrypted fields) or a dedicated connection_secrets table—never hashed

Plaid access tokens stay decryptable for Plaid API calls but are never logged or persisted in plaintext outside the encryption boundary.

Verification + regression tests:
* Unit tests enforce revoked or expired tokens fail verification and that constant-time comparison wrappers are used (`timingSafeEqual` or equivalent).
* Integration tests (auth + view link flows) capture application logs and `pg_stat_activity` samples, asserting no plaintext token segments or Plaid secrets ever appear.
* Add rotation regression tests that mint tokens under an old `key_id` and confirm current verifiers still accept them while new tokens pick up the latest algorithm/key.

Sessions:
- when using JWT sessions, avoid DB lookups entirely
- when using DB sessions, persist only the hashed token as above

---

8. RLS Approach

At request start in a single DB session or transaction, set:

SET LOCAL app.user_id = '<users.id>';
SET LOCAL app.profile_id = '<profiles.id>';
SET LOCAL app.workspace_id = '<workspaces.id or NULL>';

Policies must always gate soft-deleted data (deleted_at IS NULL) and fall back safely when session settings are absent.
Enable and FORCE RLS on all user-facing tables:
- profiles, workspace_members, workspaces
- workspace_connection_links, workspace_allowed_accounts, workspace_categories
- categories, profile_category_overrides, workspace_category_overrides, view_category_overrides
- connections, bank_accounts, transactions, transaction_overlays, transaction_audit_log
- sync_sessions, session_page_payloads, session_idempotency, session_leases, sync_audit_log
- view_links, saved_views, view_filters/view_sorts/view_group_by/view_rule_overrides/view_category_groups/view_shares
- budget_plans, budget_versions, budget_envelopes, budget_actuals (materialized table)
Caches (`user_connection_access_cache`, `profile_transaction_access_cache`) are internal-only, accessed through backend services, and protected with FORCE RLS plus explicit policies.
- These caches and sync-helper tables (`transaction_audit_log`, `sync_sessions` + dependents) are written by the `app_user` role under RLS; matching `WITH CHECK` clauses ensure inserts/updates succeed only when the caller already satisfies the visibility predicates.
Performance hygiene:
- Keep application queries layered on top of these predicates as simple as possible—avoid stacking extra OR branches that undercut index usage.
- Periodically run `EXPLAIN (ANALYZE, BUFFERS)` for representative queries in a staging environment (with RLS enabled) to confirm planners are applying the indexes above and not devolving into nested loop explosions.
- When you need heavy read paths (dashboards, exports), consider joining through the precomputed cache tables rather than recomputing access checks inside every predicate.
- For hot path joins that span connections, bank_accounts, and transactions, capture `EXPLAIN (ANALYZE, BUFFERS)` plans under realistic data and pin them as CI regression tests so policy tweaks that introduce quadratic scans fail fast.

Database Roles
- Create a dedicated application role (e.g. `app_user`) without SUPERUSER or BYPASSRLS privileges; grant only the minimal CONNECT/USAGE rights plus SELECT/INSERT/UPDATE/DELETE on application tables.
- Ownership of schemas/tables stays with a separate migration role; all DDL is executed via migrations, not the application role.

For the full list of canonical `CREATE POLICY` statements, see §13 (RLS policy definitions); treat that section as the single source of truth and mirror any narrative examples back to it.

Prisma runtime contract for RLS:
* Every request runs inside `prisma.$transaction(async (tx) => { ... })` (interactive transactions disabled).
* The first call inside the transaction executes `await tx.$executeRawUnsafe('SET LOCAL app.user_id = $1, app.profile_id = $2, app.workspace_id = $3', userId, profileId, workspaceId);` (workspaceId may be NULL for profile-only flows).
* All subsequent queries for that request must use the transactional `tx` handle; direct `prisma.table` calls outside the wrapper are forbidden because they lack the SET LOCAL context.
* Background jobs that do not act on behalf of a user should SET LOCAL GUCs to NULL explicitly to avoid inheriting stale values.
* Provide a `clear_app_context()` SQL helper (`SET LOCAL app.user_id = NULL; SET LOCAL app.profile_id = NULL; SET LOCAL app.workspace_id = NULL;`) and call it when booting worker processes or when a transaction finishes without needing caller context.
* Wrap the Prisma client in an application helper:
  ```ts
  export async function withAppContext<T>(ids: { userId: string; profileId: string; workspaceId: string | null }, fn: (tx: PrismaTransactionClient) => Promise<T>) {
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
  ```
  Scoped repositories receive the `tx` handle only; never expose the root `prisma` client.
* Enforce wrapper usage with tooling: add an ESLint rule (e.g., custom lint or `eslint-plugin-boundaries`) that flags `prisma.<model>` access outside approved modules, and provide a dev-time proxy that throws if `prisma` is touched without an active context (check a `AsyncLocalStorage` flag).
* If PgBouncer transaction pooling is introduced, keep this pattern: start the transaction, set GUCs, run queries, then commit/rollback immediately. Add regression tests in CI that run against a PgBouncer-enabled Neon branch (`PGBOUNCER=true pnpm test --filter=core -- --run`) to confirm `SET LOCAL` sticks for the lifetime of the transaction.

---

9. Data Integrity and Retention

Base transactions are append-only
Soft delete via deleted_at on user-generated tables
TTL sweeps for session_page_payloads.expires_at (30–90 days)
Scheduled housekeeping jobs remove expired sessions, verification tokens, and view links, and clean up large payload blobs
GDPR deletion via scripts traversing user and profile graphs
Revoked Plaid items / deleted connections: set connections.status to 'deleted' (or 'error'), stamp connections.deleted_at, revoke workspace_connection_links, and mark workspace_allowed_accounts.revoked_at for impacted accounts
Soft-deleting connections or bank_accounts hides them from direct list views but keeps historical transactions and overlays visible to authorized profiles/workspaces (RLS continues to grant access).

---

10. Migrations and Environments

Prisma Migrate in CI for dev, preview, prod; Neon branches for PR previews
Seeds: create profiles on signup, insert system categories (profile_id IS NULL)
Seeding runs under the migration/service role with BYPASSRLS; application role (`app_user`) cannot insert system rows (profile_id/workspace_id NULL) such as system categories or default workspace trees.
Contract tests ensure API matches constraints; optional pgTAP for RLS
Store trigger/exclusion/BRIN/partial index definitions in SQL migrations, then mirror naming with Prisma @map/@@map
Keep helper functions (e.g., workspace_allows_account, validate_transaction_overlay_splits) and RLS policies defined alongside those SQL migrations for deterministic deploys
Declare FK `ON DELETE` actions per the guardrail matrix (restrict for soft-deleted parents, cascade for sync/cache fan-out); do not accept Prisma defaults.
Push NOT NULL defaults wherever the schema expects presence (timestamps, FK columns, hashes)
Regularly audit migrations to ensure required columns never ship nullable (FKs, created_at/updated_at, hashes, statuses)
updated_at columns rely on Prisma `@updatedAt`; omit DEFAULTs in SQL to prevent drift
Extensions: enable pgcrypto (UUID/tokens), btree_gist (exclusion indexes), optional pg_trgm for search

---

11. Budget Actuals (Computation Notes)

budget_actuals stores (plan_id, version_id, envelope_id, period)
Resolve filters via view_id (live) or view_filter_snapshot (frozen)
Apply workspace_connection_links.account_scope_json
Sum transactions.amount_cents by posted date honoring rollup_mode
Ignore transactions whose currency differs from the plan/workspace currency until FX conversion support arrives
Refresh nightly and on relevant writes; index by (version_id, period)
Expose a `CREATE VIEW budget_actuals_mv AS SELECT * FROM budget_actuals` if callers expect the legacy name—keep RLS on the underlying table.

---

12. Drop-in SQL Indexes and Checks (Examples)

These snippets illustrate the raw SQL that backs the declarative constraints above—do not duplicate them if Prisma/DDL has already created equivalent uniques or checks. Treat this section as reference when hand-writing migrations or verifying generated SQL.

CREATE UNIQUE INDEX uq_ws_conn_active
ON workspace_connection_links (workspace_id, connection_id)
WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX uq_bank_accounts_id_conn
ON bank_accounts (id, connection_id);

CREATE UNIQUE INDEX uq_categories_scoped_slug
ON categories (COALESCE(profile_id, '00000000-0000-0000-0000-000000000000'), slug)
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
ON workspace_category_overrides (workspace_id, COALESCE(source_category_id, system_source_category_id))
WHERE deleted_at IS NULL;

CREATE INDEX ix_workspace_category_overrides_source
ON workspace_category_overrides (workspace_id, system_source_category_id, deleted_at);

CREATE INDEX ix_workspace_category_overrides_source_local
ON workspace_category_overrides (workspace_id, source_category_id, deleted_at);

CREATE UNIQUE INDEX uq_view_category_overrides
ON view_category_overrides (view_id, COALESCE(source_category_id, system_source_category_id))
WHERE deleted_at IS NULL;

CREATE INDEX ix_view_category_overrides_source
ON view_category_overrides (view_id, system_source_category_id, deleted_at);

CREATE INDEX ix_view_category_overrides_source_local
ON view_category_overrides (view_id, source_category_id, deleted_at);

ALTER TABLE api_keys
ADD CONSTRAINT api_keys_owner_ck
CHECK (profile_id IS NOT NULL);

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
ON workspace_members
USING gin (scope_json jsonb_path_ops);

ALTER TABLE workspace_category_overrides
ADD CONSTRAINT workspace_category_overrides_source_target_ck
CHECK (
  (
    (source_category_id IS NOT NULL AND system_source_category_id IS NULL)
    OR (source_category_id IS NULL AND system_source_category_id IS NOT NULL)
  )
  AND (
    (target_category_id IS NOT NULL AND system_target_category_id IS NULL)
    OR (target_category_id IS NULL AND system_target_category_id IS NOT NULL)
  )
);

ALTER TABLE view_category_overrides
ADD CONSTRAINT view_category_overrides_source_target_ck
CHECK (
  (
    (source_category_id IS NOT NULL AND system_source_category_id IS NULL)
    OR (source_category_id IS NULL AND system_source_category_id IS NOT NULL)
  )
  AND (
    (target_category_id IS NOT NULL AND system_target_category_id IS NULL)
    OR (target_category_id IS NULL AND system_target_category_id IS NOT NULL)
  )
);

---

13. Testing and Operational Hardening

RLS verification:
- pgTAP: `tooling/tests/pgtap/rls_contract.sql` spins up fixtures for owners, admins, editors, viewers, unaffiliated profiles, and anonymous callers; each suite asserts allowed SELECT/INSERT/UPDATE/DELETE paths succeed and denied paths raise `ERROR: new row violates row-level security policy`.
- Application E2E (Playwright) runs the main flows (dashboard, overlays, budgets, sharing) under each role plus link-based access to ensure the SDK honors denied responses gracefully.
- Smoke test CLI (`tooling/scripts/rls-smoke.ts`): connects as `app_user` with no `SET LOCAL`, iterates every RLS-enabled table, executes `SELECT 1 FROM <table> LIMIT 1`, and asserts zero rows. Wire into CI (`pnpm db:rls-smoke`) so regressions fail fast.
- RLS coverage query (`tooling/scripts/check-rls-policies.ts`): `SELECT tab.relname FROM pg_class tab JOIN pg_namespace ns ON ns.oid = tab.relnamespace WHERE relkind = 'r' AND pg_has_role(tab.relowner, 'USAGE') AND rowsecurity = true EXCEPT SELECT polrelid::regclass::text FROM pg_policies;` must return zero rows before deploy; include FORCE RLS checkers.
- Performance guard: capture `EXPLAIN (ANALYZE, BUFFERS)` for representative role queries (owner/admin/editor/viewer) against seeded data in a Neon preview branch and fail CI if costs/row counts exceed agreed thresholds (e.g., unexpected full-table scans on transactions/workspace_allowed_accounts).
- Schema drift control:
- CI job (`pnpm db:schema-drift`) captures `pg_dump --schema-only` from the Neon preview branch and diffs against `tooling/schema-snapshots/canonical.sql`; unexpected changes fail the build.
- Treat this document as consumers’ guide; the checked-in schema is the source of truth. Every migration must update both the schema and this doc (or regenerate relevant sections) to keep them aligned.

Deferrable constraints + trigger validation:
- Catalog all `DEFERRABLE INITIALLY DEFERRED` constraints/triggers (`categories_parent_scope_ck`, `workspace_categories_parent_scope_ck`, `api_keys_validate_profile_link`, `api_keys_validate_workspace_link`, `workspace_connection_links_scope_ck`, `transaction_overlays_splits_validate`) in `tooling/scripts/check-deferrables.ts` and fail CI if new ones are added without tests.
- Add bulk transaction tests (pgTAP or Prisma integration) that insert/update conflicting rows within a single transaction to ensure deferrable checks fire at COMMIT and do not deadlock.
- Include stress tests that run parallel transactions touching the same parents to confirm constraint timing does not surface serialization anomalies.
- Verify Prisma migrations preserve `DEFERRABLE INITIALLY DEFERRED` clauses: keep these constraints defined in SQL migrations, and add a regression test (`pnpm db:check-deferrables`) that introspects `pg_constraint` / `pg_trigger` to ensure `condeferrable = true` and `condeferred = true`.

Append-only enforcement:
- pgTAP/Prisma tests attempt `UPDATE`/`DELETE` on `transactions` as `app_user` and assert the trigger raises `ERROR: transactions are append-only` from `prevent_transaction_mutation()`.
- Contract tests covering category/description/split edits verify they operate through overlays or new append entries; query logging must show no direct `UPDATE transactions`.
- E2E flows ensure the API surfaces a structured 409 error with a user-friendly message when append-only violations occur instead of returning a generic 500.

Neon index + plan validation:
* Seed realistic data (`tooling/scripts/seed-demo.ts --rows 500k`) into a fresh Neon branch before plan capture.
* Capture `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for the four critical workloads and persist outputs under `tooling/plans/<query>.json`:
  - Transaction feeds filtered by workspace/profile/date (`transactions` joined to `bank_accounts`, `workspace_allowed_accounts`).
  - Budget aggregation using `budget_actuals` (and optional `budget_actuals_mv` view).
  - Connection and bank account listings (including workspace scoping joins).
  - Sync session / audit history queries (`sync_sessions` + payloads + audit log).
* Verify plans via automated assertions (`tooling/scripts/validate-plans.ts`):
  - `Index Scan using transactions_account_id_posted_at_idx` (or equivalent) plus BRIN usage on `transactions_posted_at_brin`.
  - GIN index usage on JSONB-heavy predicates: `scope_json_gin`, `account_scope_json_gin`, `raw_payload_gin`, etc. Reject plans that fall back to `Seq Scan` on those tables.
  - Workspace membership lookups hit the composite B-tree indexes on `workspace_members`, `workspace_allowed_accounts`, and `workspace_connection_links`.
* Wire the validator into CI (`pnpm db:plan-validate`) so any regression (missing index usage, new sequential scans, buffer blow-ups) fails the build. Store updated plan snapshots only after reviewing `ANALYZE` stats to confirm they still honour the indexed paths.
- Category resolver parity: `tooling/tests/pgtap/effective_category.sql` generates randomized combinations of system/workspace/profile/view overrides and overlays, compares `effective_transaction_category` / `effective_workspace_category` outputs against equivalent JOIN logic, and runs via `pnpm db:test -- --run`; wired into CI to prevent precedence regressions.
- Budget budget_actuals invariants: tests cover `budget_plans_enforce_currency`, refresh jobs (nightly + write-triggered) respecting rollup_mode, currency filters, and account scope RLS; include query plan assertions ensuring required indexes (`version_id, period` and `plan_id, version_id, period`) are used.

Lifecycle jobs:
- Nightly jobs purge expired rows from `sessions`, `verification_tokens`, `view_links`, `workspace_connection_links` (revoked or expired), and `session_page_payloads`; large sync payload blobs share the same sweep.
- QStash/Vercel cron tasks update `workspace_connection_links` -> `workspace_allowed_accounts` denormalisations and refresh `budget_actuals` (and the optional `budget_actuals_mv` view).
- TTL sweeps run under a dedicated `maintenance_user` role with `SET LOCAL app.profile_id = NULL` / `app.workspace_id = NULL` to avoid inheriting stale context; ensure the role has DELETE privileges on the targets and bypasses RLS only where documented.
- Automated jobs must execute in transactions and respect FK order: purge child payloads (`session_page_payloads`, sync blobs) before parent `sync_sessions` deletions to avoid FK violations.
- Add regression tests that run the TTL scripts against seeded data to confirm RLS policies still allow the maintenance role to delete rows and that cache tables remain consistent (no orphaned references).
- Emit structured logs/metrics for each TTL run (rows deleted, duration) and configure alerts when a job fails or deletes zero rows over multiple runs (potential scheduling drift or RLS misconfiguration).

GDPR and incident response:
- `tooling/scripts/gdpr-delete.ts` performs a cascading soft-delete: start from users.id, wipe Auth.js tables, profiles, workspaces (including member rows), connections, cached access tables, overlays, and sync artifacts while preserving immutable transactions (RLS continues to block the removed user).
- Script must support `--dry-run` (log intended deletions without mutating) and structured logging of each step; store audit outputs for incident review.
- Add regression tests that run the script against fixtures, then assert:
  * RLS denies all data when the deleted user attempts to query (no profile/workspace context remains).
  * Immutable transactions still exist but have no accessible overlays/cache entries tied to the deleted profile.

CREATE POLICY connections_rw
ON connections
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND deleted_at IS NULL
  AND (
    owner_profile_id = current_setting('app.profile_id', true)::uuid
    OR (
      current_setting('app.workspace_id', true) IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM workspace_members wm
        WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
          AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
      )
      AND EXISTS (
        SELECT 1
        FROM bank_accounts ba
        WHERE ba.connection_id = connections.id
          AND ba.deleted_at IS NULL
          AND (
            EXISTS (
              SELECT 1
              FROM workspace_allowed_accounts waa
              WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
                AND waa.bank_account_id = ba.id
                AND waa.revoked_at IS NULL
            )
            OR EXISTS (
              SELECT 1
              FROM workspace_connection_links wcl
              WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
                AND wcl.revoked_at IS NULL
                AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
                AND (
                  wcl.account_scope_json IS NULL
                  OR ba.id::text IN (
                       SELECT jsonb_array_elements_text(wcl.account_scope_json)
                     )
                )
            )
          )
      )
    )
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND deleted_at IS NULL
  AND owner_profile_id = current_setting('app.profile_id', true)::uuid
);

CREATE POLICY workspace_members_rw
ON workspace_members
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND (
    member_profile_id = current_setting('app.profile_id', true)::uuid
    OR EXISTS (
      SELECT 1
      FROM workspace_members wm_admin
      WHERE wm_admin.workspace_id = workspace_members.workspace_id
        AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
        AND wm_admin.role IN ('owner', 'admin')
    )
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM workspace_members wm_admin
    WHERE wm_admin.workspace_id = workspace_members.workspace_id
      AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
      AND wm_admin.role IN ('owner', 'admin')
  )
);

CREATE POLICY workspace_connection_links_access
ON workspace_connection_links
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND current_setting('app.workspace_id', true) IS NOT NULL
  AND workspace_id = current_setting('app.workspace_id', true)::uuid
  AND EXISTS (
    SELECT 1
    FROM workspace_members wm
    WHERE wm.workspace_id = workspace_connection_links.workspace_id
      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND current_setting('app.workspace_id', true) IS NOT NULL
  AND workspace_id = current_setting('app.workspace_id', true)::uuid
  AND EXISTS (
    SELECT 1
    FROM workspace_members wm_admin
    WHERE wm_admin.workspace_id = workspace_connection_links.workspace_id
      AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
      AND wm_admin.role IN ('owner', 'admin')
  )
);

-- NOTE: Workspace access policies inline their predicates; keep workspace_allows_account out of RLS to avoid recursive evaluation.
CREATE POLICY workspace_allowed_accounts_access
ON workspace_allowed_accounts
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND current_setting('app.workspace_id', true) IS NOT NULL
  AND workspace_id = current_setting('app.workspace_id', true)::uuid
  AND EXISTS (
    SELECT 1
    FROM workspace_members wm
    WHERE wm.workspace_id = workspace_allowed_accounts.workspace_id
      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND current_setting('app.workspace_id', true) IS NOT NULL
  AND workspace_id = current_setting('app.workspace_id', true)::uuid
  AND EXISTS (
    SELECT 1
    FROM workspace_members wm_admin
    WHERE wm_admin.workspace_id = workspace_allowed_accounts.workspace_id
      AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
      AND wm_admin.role IN ('owner', 'admin')
  )
);

CREATE POLICY bank_accounts_rw
ON bank_accounts
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM connections c
    WHERE c.id = bank_accounts.connection_id
      AND c.deleted_at IS NULL
      AND (
        c.owner_profile_id = current_setting('app.profile_id', true)::uuid
        OR (
          current_setting('app.workspace_id', true) IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM workspace_members wm
            WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
              AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
          )
          AND (
            EXISTS (
              SELECT 1
              FROM workspace_allowed_accounts waa
              WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
                AND waa.bank_account_id = bank_accounts.id
                AND waa.revoked_at IS NULL
            )
            OR EXISTS (
              SELECT 1
              FROM workspace_connection_links wcl
              WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
                AND wcl.revoked_at IS NULL
                AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
                AND (
                  wcl.account_scope_json IS NULL
                  OR bank_accounts.id::text IN (
                       SELECT jsonb_array_elements_text(wcl.account_scope_json)
                     )
                )
            )
          )
        )
      )
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM connections c
    WHERE c.id = bank_accounts.connection_id
      AND c.owner_profile_id = current_setting('app.profile_id', true)::uuid
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY transactions_owner_insert
ON transactions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM connections c
    WHERE c.id = transactions.connection_id
      AND current_setting('app.profile_id', true) IS NOT NULL
      AND c.deleted_at IS NULL
      AND c.owner_profile_id = current_setting('app.profile_id', true)::uuid
  )
);

CREATE POLICY transactions_access
ON transactions
FOR SELECT
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND (
    EXISTS (
      SELECT 1
      FROM connections c
      JOIN bank_accounts ba ON ba.id = transactions.account_id
      WHERE c.id = transactions.connection_id
        AND c.owner_profile_id = current_setting('app.profile_id', true)::uuid
    )
    OR (
      current_setting('app.workspace_id', true) IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM workspace_members wm
        WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
          AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
      )
      AND (
        EXISTS (
          SELECT 1
          FROM workspace_allowed_accounts waa
          WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
            AND waa.bank_account_id = transactions.account_id
            AND waa.revoked_at IS NULL
        )
        OR EXISTS (
          SELECT 1
          FROM workspace_connection_links wcl
          WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
            AND wcl.revoked_at IS NULL
            AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
            AND (
              wcl.account_scope_json IS NULL
              OR transactions.account_id::text IN (
                   SELECT jsonb_array_elements_text(wcl.account_scope_json)
                 )
            )
        )
      )
    )
  )
);

-- No UPDATE/DELETE policies are defined; transactions stay append-only for app_user.

CREATE POLICY transaction_overlays_self
ON transaction_overlays
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND deleted_at IS NULL
  AND profile_id = current_setting('app.profile_id', true)::uuid
  AND EXISTS (
    SELECT 1
    FROM transactions t
    JOIN connections c ON c.id = t.connection_id
    JOIN bank_accounts ba ON ba.id = t.account_id
    WHERE t.id = transaction_overlays.transaction_id
      AND (
        c.owner_profile_id = current_setting('app.profile_id', true)::uuid
        OR (
          current_setting('app.workspace_id', true) IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM workspace_members wm
            WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
              AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
          )
          AND (
            EXISTS (
              SELECT 1
              FROM workspace_allowed_accounts waa
              WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
                AND waa.bank_account_id = t.account_id
                AND waa.revoked_at IS NULL
            )
            OR EXISTS (
              SELECT 1
              FROM workspace_connection_links wcl
              WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
                AND wcl.revoked_at IS NULL
                AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
                AND (
                  wcl.account_scope_json IS NULL
                  OR t.account_id::text IN (
                       SELECT jsonb_array_elements_text(wcl.account_scope_json)
                     )
                )
            )
          )
        )
      )
  )
)
WITH CHECK (
  profile_id = current_setting('app.profile_id', true)::uuid
  AND EXISTS (
    SELECT 1
    FROM transactions t
    JOIN connections c ON c.id = t.connection_id
    JOIN bank_accounts ba ON ba.id = t.account_id
    WHERE t.id = transaction_overlays.transaction_id
      AND (
        c.owner_profile_id = current_setting('app.profile_id', true)::uuid
        OR (
          current_setting('app.workspace_id', true) IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM workspace_members wm
            WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
              AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
          )
          AND (
            EXISTS (
              SELECT 1
              FROM workspace_allowed_accounts waa
              WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
                AND waa.bank_account_id = t.account_id
                AND waa.revoked_at IS NULL
            )
            OR EXISTS (
              SELECT 1
              FROM workspace_connection_links wcl
              WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
                AND wcl.revoked_at IS NULL
                AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
                AND (
                  wcl.account_scope_json IS NULL
                  OR t.account_id::text IN (
                       SELECT jsonb_array_elements_text(wcl.account_scope_json)
                     )
                )
            )
          )
        )
      )
  )
);

CREATE POLICY user_connection_cache_policy
ON user_connection_access_cache
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND profile_id = current_setting('app.profile_id', true)::uuid
  AND (
    workspace_id IS NULL
    OR workspace_id = current_setting('app.workspace_id', true)::uuid
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND profile_id = current_setting('app.profile_id', true)::uuid
  AND (
    workspace_id IS NULL
    OR workspace_id = current_setting('app.workspace_id', true)::uuid
  )
);

CREATE POLICY profile_transaction_cache_policy
ON profile_transaction_access_cache
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND profile_id = current_setting('app.profile_id', true)::uuid
  AND (
    workspace_id IS NULL
    OR workspace_id = current_setting('app.workspace_id', true)::uuid
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND profile_id = current_setting('app.profile_id', true)::uuid
  AND (
    workspace_id IS NULL
    OR workspace_id = current_setting('app.workspace_id', true)::uuid
  )
);

CREATE POLICY profiles_self_rw
ON profiles
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND id = current_setting('app.profile_id', true)::uuid
)
WITH CHECK (
  id = current_setting('app.profile_id', true)::uuid
);

CREATE POLICY workspaces_membership_access
ON workspaces
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND (
    owner_profile_id = current_setting('app.profile_id', true)::uuid
    OR EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
    )
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND owner_profile_id = current_setting('app.profile_id', true)::uuid
);

CREATE POLICY categories_profile_scope
ON categories
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND (
    profile_id IS NULL
    OR profile_id = current_setting('app.profile_id', true)::uuid
  )
)
WITH CHECK (
  profile_id = current_setting('app.profile_id', true)::uuid
);

CREATE POLICY profile_category_overrides_self
ON profile_category_overrides
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND profile_id = current_setting('app.profile_id', true)::uuid
)
WITH CHECK (
  profile_id = current_setting('app.profile_id', true)::uuid
);

CREATE POLICY workspace_categories_membership
ON workspace_categories
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND current_setting('app.workspace_id', true) IS NOT NULL
  AND workspace_id = current_setting('app.workspace_id', true)::uuid
  AND EXISTS (
    SELECT 1
    FROM workspace_members wm
    WHERE wm.workspace_id = workspace_categories.workspace_id
      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND current_setting('app.workspace_id', true) IS NOT NULL
  AND workspace_id = current_setting('app.workspace_id', true)::uuid
  AND EXISTS (
    SELECT 1
    FROM workspace_members wm_admin
    WHERE wm_admin.workspace_id = workspace_categories.workspace_id
      AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
      AND wm_admin.role IN ('owner', 'admin')
  )
);

CREATE POLICY workspace_category_overrides_membership
ON workspace_category_overrides
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND current_setting('app.workspace_id', true) IS NOT NULL
  AND workspace_id = current_setting('app.workspace_id', true)::uuid
  AND EXISTS (
    SELECT 1
    FROM workspace_members wm
    WHERE wm.workspace_id = workspace_category_overrides.workspace_id
      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND current_setting('app.workspace_id', true) IS NOT NULL
  AND workspace_id = current_setting('app.workspace_id', true)::uuid
  AND EXISTS (
    SELECT 1
    FROM workspace_members wm_admin
    WHERE wm_admin.workspace_id = workspace_category_overrides.workspace_id
      AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
      AND wm_admin.role IN ('owner', 'admin')
  )
);

CREATE POLICY view_category_overrides_membership
ON view_category_overrides
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM saved_views sv
    JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
    WHERE sv.id = view_category_overrides.view_id
      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM saved_views sv
    JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
    WHERE sv.id = view_category_overrides.view_id
      AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
      AND wm_admin.role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY saved_views_membership
ON saved_views
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM workspace_members wm
    WHERE wm.workspace_id = saved_views.workspace_id
      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM workspace_members wm_admin
    WHERE wm_admin.workspace_id = saved_views.workspace_id
      AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
      AND wm_admin.role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY view_filters_membership
ON view_filters
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM saved_views sv
    JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
    WHERE sv.id = view_filters.view_id
      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM saved_views sv
    JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
    WHERE sv.id = view_filters.view_id
      AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
      AND wm_admin.role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY view_sorts_membership
ON view_sorts
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM saved_views sv
    JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
    WHERE sv.id = view_sorts.view_id
      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM saved_views sv
    JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
    WHERE sv.id = view_sorts.view_id
      AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
      AND wm_admin.role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY view_group_by_membership
ON view_group_by
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM saved_views sv
    JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
    WHERE sv.id = view_group_by.view_id
      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM saved_views sv
    JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
    WHERE sv.id = view_group_by.view_id
      AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
      AND wm_admin.role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY view_rule_overrides_membership
ON view_rule_overrides
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM saved_views sv
    JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
    WHERE sv.id = view_rule_overrides.view_id
      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM saved_views sv
    JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
    WHERE sv.id = view_rule_overrides.view_id
      AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
      AND wm_admin.role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY view_category_groups_membership
ON view_category_groups
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM saved_views sv
    JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
    WHERE sv.id = view_category_groups.view_id
      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM saved_views sv
    JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
    WHERE sv.id = view_category_groups.view_id
      AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
      AND wm_admin.role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY view_shares_membership
ON view_shares
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM saved_views sv
    JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
    WHERE sv.id = view_shares.view_id
      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM saved_views sv
    JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
    WHERE sv.id = view_shares.view_id
      AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
      AND wm_admin.role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY view_links_membership
ON view_links
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM saved_views sv
    JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
    WHERE sv.id = view_links.view_id
      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM saved_views sv
    JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
    WHERE sv.id = view_links.view_id
      AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
      AND wm_admin.role IN ('owner', 'admin')
  )
);

CREATE POLICY transaction_audit_log_access
ON transaction_audit_log
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM transactions t
    JOIN connections c ON c.id = t.connection_id
    JOIN bank_accounts ba ON ba.id = t.account_id
    WHERE t.id = transaction_audit_log.transaction_id
      AND (
        c.owner_profile_id = current_setting('app.profile_id', true)::uuid
        OR (
          current_setting('app.workspace_id', true) IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM workspace_members wm
            WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
              AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
          )
          AND (
            EXISTS (
              SELECT 1
              FROM workspace_allowed_accounts waa
              WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
                AND waa.bank_account_id = ba.id
                AND waa.revoked_at IS NULL
            )
            OR EXISTS (
              SELECT 1
              FROM workspace_connection_links wcl
              WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
                AND wcl.revoked_at IS NULL
                AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
                AND (
                  wcl.account_scope_json IS NULL
                  OR ba.id::text IN (
                       SELECT jsonb_array_elements_text(wcl.account_scope_json)
                     )
                )
            )
          )
        )
      )
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM transactions t
    JOIN connections c ON c.id = t.connection_id
    JOIN bank_accounts ba ON ba.id = t.account_id
    WHERE t.id = transaction_audit_log.transaction_id
      AND (
        c.owner_profile_id = current_setting('app.profile_id', true)::uuid
        OR (
          current_setting('app.workspace_id', true) IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM workspace_members wm
            WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
              AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
          )
          AND (
            EXISTS (
              SELECT 1
              FROM workspace_allowed_accounts waa
              WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
                AND waa.bank_account_id = ba.id
                AND waa.revoked_at IS NULL
            )
            OR EXISTS (
              SELECT 1
              FROM workspace_connection_links wcl
              WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
                AND wcl.revoked_at IS NULL
                AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
                AND (
                  wcl.account_scope_json IS NULL
                  OR ba.id::text IN (
                       SELECT jsonb_array_elements_text(wcl.account_scope_json)
                     )
                )
            )
          )
        )
      )
  )
);

CREATE POLICY sync_sessions_access
ON sync_sessions
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM connections c
    WHERE c.id = sync_sessions.connection_id
      AND c.deleted_at IS NULL
      AND (
        c.owner_profile_id = current_setting('app.profile_id', true)::uuid
        OR (
          current_setting('app.workspace_id', true) IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM workspace_members wm
            WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
              AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
          )
        )
      )
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM connections c
    WHERE c.id = sync_sessions.connection_id
      AND c.deleted_at IS NULL
      AND (
        c.owner_profile_id = current_setting('app.profile_id', true)::uuid
        OR (
          current_setting('app.workspace_id', true) IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM workspace_members wm
            WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
              AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
          )
        )
      )
  )
);

CREATE POLICY session_page_payloads_access
ON session_page_payloads
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM sync_sessions ss
    JOIN connections c ON c.id = ss.connection_id
    WHERE ss.id = session_page_payloads.sync_session_id
      AND c.deleted_at IS NULL
      AND (
        c.owner_profile_id = current_setting('app.profile_id', true)::uuid
        OR (
          current_setting('app.workspace_id', true) IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM workspace_members wm
            WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
              AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
          )
        )
      )
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM sync_sessions ss
    JOIN connections c ON c.id = ss.connection_id
    WHERE ss.id = session_page_payloads.sync_session_id
      AND c.deleted_at IS NULL
      AND (
        c.owner_profile_id = current_setting('app.profile_id', true)::uuid
        OR (
          current_setting('app.workspace_id', true) IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM workspace_members wm
            WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
              AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
          )
        )
      )
  )
);

CREATE POLICY session_idempotency_access
ON session_idempotency
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM sync_sessions ss
    JOIN connections c ON c.id = ss.connection_id
    WHERE ss.id = session_idempotency.sync_session_id
      AND c.deleted_at IS NULL
      AND (
        c.owner_profile_id = current_setting('app.profile_id', true)::uuid
        OR (
          current_setting('app.workspace_id', true) IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM workspace_members wm
            WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
              AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
          )
        )
      )
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM sync_sessions ss
    JOIN connections c ON c.id = ss.connection_id
    WHERE ss.id = session_idempotency.sync_session_id
      AND c.deleted_at IS NULL
      AND (
        c.owner_profile_id = current_setting('app.profile_id', true)::uuid
        OR (
          current_setting('app.workspace_id', true) IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM workspace_members wm
            WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
              AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
          )
        )
      )
  )
);

CREATE POLICY session_leases_access
ON session_leases
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM sync_sessions ss
    JOIN connections c ON c.id = ss.connection_id
    WHERE ss.id = session_leases.sync_session_id
      AND c.deleted_at IS NULL
      AND (
        c.owner_profile_id = current_setting('app.profile_id', true)::uuid
        OR (
          current_setting('app.workspace_id', true) IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM workspace_members wm
            WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
              AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
          )
        )
      )
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM sync_sessions ss
    JOIN connections c ON c.id = ss.connection_id
    WHERE ss.id = session_leases.sync_session_id
      AND c.deleted_at IS NULL
      AND (
        c.owner_profile_id = current_setting('app.profile_id', true)::uuid
        OR (
          current_setting('app.workspace_id', true) IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM workspace_members wm
            WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
              AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
          )
        )
      )
  )
);

CREATE POLICY sync_audit_log_access
ON sync_audit_log
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND (
    initiator_profile_id = current_setting('app.profile_id', true)::uuid
    OR EXISTS (
      SELECT 1
      FROM connections c
      WHERE c.id = sync_audit_log.connection_id
        AND c.deleted_at IS NULL
        AND (
          c.owner_profile_id = current_setting('app.profile_id', true)::uuid
          OR (
            current_setting('app.workspace_id', true) IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM workspace_members wm
              WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
            )
          )
        )
    )
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND (
    initiator_profile_id = current_setting('app.profile_id', true)::uuid
    OR EXISTS (
      SELECT 1
      FROM connections c
      WHERE c.id = sync_audit_log.connection_id
        AND c.deleted_at IS NULL
        AND (
          c.owner_profile_id = current_setting('app.profile_id', true)::uuid
          OR (
            current_setting('app.workspace_id', true) IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM workspace_members wm
              WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
            )
          )
        )
    )
  )
);

CREATE POLICY api_keys_self
ON api_keys
USING (
  current_setting('app.user_id', true) IS NOT NULL
  AND user_id = current_setting('app.user_id', true)::uuid
)
WITH CHECK (
  user_id = current_setting('app.user_id', true)::uuid
);

CREATE POLICY subscriptions_owner
ON subscriptions
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND profile_id = current_setting('app.profile_id', true)::uuid
)
WITH CHECK (
  profile_id = current_setting('app.profile_id', true)::uuid
);

CREATE POLICY budget_plans_membership
ON budget_plans
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM workspace_members wm
    WHERE wm.workspace_id = budget_plans.workspace_id
      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM workspace_members wm_admin
    WHERE wm_admin.workspace_id = budget_plans.workspace_id
      AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
      AND wm_admin.role IN ('owner','admin')
  )
);

CREATE POLICY budget_versions_membership
ON budget_versions
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM budget_plans bp
    JOIN workspace_members wm ON wm.workspace_id = bp.workspace_id
    WHERE bp.id = budget_versions.plan_id
      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM budget_plans bp
    JOIN workspace_members wm_admin ON wm_admin.workspace_id = bp.workspace_id
    WHERE bp.id = budget_versions.plan_id
      AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
      AND wm_admin.role IN ('owner','admin')
  )
);

CREATE POLICY budget_envelopes_membership
ON budget_envelopes
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM budget_versions bv
    JOIN budget_plans bp ON bp.id = bv.plan_id
    JOIN workspace_members wm ON wm.workspace_id = bp.workspace_id
    WHERE bv.id = budget_envelopes.version_id
      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
  )
)
WITH CHECK (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM budget_versions bv
    JOIN budget_plans bp ON bp.id = bv.plan_id
    JOIN workspace_members wm_admin ON wm_admin.workspace_id = bp.workspace_id
    WHERE bv.id = budget_envelopes.version_id
      AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
      AND wm_admin.role IN ('owner','admin')
  )
);

CREATE POLICY budget_actuals_membership
ON budget_actuals
USING (
  current_setting('app.profile_id', true) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM budget_plans bp
    JOIN workspace_members wm ON wm.workspace_id = bp.workspace_id
    WHERE bp.id = budget_actuals.plan_id
      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
  )
);

RLS Coverage Checklist
* psql: `SELECT relname FROM pg_class WHERE relrowsecurity AND relforcerowsecurity AND relname NOT IN (SELECT polrelid::regclass::text FROM pg_policy) ORDER BY 1;` — must return zero rows.
* For each role (owner, admin, editor, viewer, unaffiliated), run canned query suites that exercise SELECT/INSERT/UPDATE/DELETE across profiles, workspaces, financial tables, views, sync logs, and caches; expect successes to align with policies above and failures to raise `ERROR: new row violates row-level security policy`.
* Keep regression tests (pgTAP + application E2Es) green before shipping migrations that touch policies; see Tests and Ops Hardening for required coverage.
* Auth.js adapter tables run under the `auth_service` role with `BYPASSRLS`; they are intentionally excluded from the RLS coverage checklist.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_connection_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_connection_links FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_allowed_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_allowed_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories FORCE ROW LEVEL SECURITY;
ALTER TABLE profile_category_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_category_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_category_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_category_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE view_category_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE view_category_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_views FORCE ROW LEVEL SECURITY;
ALTER TABLE view_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE view_filters FORCE ROW LEVEL SECURITY;
ALTER TABLE view_sorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE view_sorts FORCE ROW LEVEL SECURITY;
ALTER TABLE view_group_by ENABLE ROW LEVEL SECURITY;
ALTER TABLE view_group_by FORCE ROW LEVEL SECURITY;
ALTER TABLE view_rule_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE view_rule_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE view_category_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE view_category_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE view_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE view_shares FORCE ROW LEVEL SECURITY;
ALTER TABLE view_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE view_links FORCE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections FORCE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE transaction_overlays ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_overlays FORCE ROW LEVEL SECURITY;
ALTER TABLE transaction_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE session_page_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_page_payloads FORCE ROW LEVEL SECURITY;
ALTER TABLE session_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_idempotency FORCE ROW LEVEL SECURITY;
ALTER TABLE session_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_leases FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE user_connection_access_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_connection_access_cache FORCE ROW LEVEL SECURITY;
ALTER TABLE profile_transaction_access_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_transaction_access_cache FORCE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE budget_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE budget_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE budget_envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_envelopes FORCE ROW LEVEL SECURITY;
ALTER TABLE budget_actuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_actuals FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS workspace_allowed_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id),
  granted_by_profile_id uuid NOT NULL REFERENCES profiles(id),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, bank_account_id) WHERE revoked_at IS NULL
);

CREATE OR REPLACE FUNCTION workspace_allows_account(workspace uuid, bank_account uuid)
RETURNS boolean AS $$
  -- Application-level convenience helper (not used inside RLS after inlining).
  -- Never call it from policies on workspace_allowed_accounts or workspace_connection_links to avoid recursive evaluation.
  -- Callers must align the workspace argument with their current auth context so EXISTS predicates stay selective.
  SELECT EXISTS (
           SELECT 1
           FROM workspace_allowed_accounts waa
           WHERE waa.workspace_id = workspace
             AND waa.bank_account_id = bank_account
             AND waa.revoked_at IS NULL
         )
      OR EXISTS (
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
-- Runs as SECURITY INVOKER so the app role stays behind FORCE RLS; ensure policies above permit the necessary SELECT checks.
-- If future use cases require bypassing RLS, flip to SECURITY DEFINER and harden search_path/role grants to prevent privilege escalation.
-- Performance note: consider pre-joining in long-running reports instead of chaining this helper inside deep RLS predicates.

CREATE OR REPLACE FUNCTION prevent_transaction_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'transactions are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transactions_no_update
BEFORE UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION prevent_transaction_mutation();

CREATE TRIGGER transactions_no_delete
BEFORE DELETE ON transactions
FOR EACH ROW EXECUTE FUNCTION prevent_transaction_mutation();

CREATE OR REPLACE FUNCTION ensure_category_parent_scope()
RETURNS trigger AS $$
DECLARE parent_profile uuid;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT profile_id INTO parent_profile FROM categories WHERE id = NEW.parent_id;
  IF (parent_profile IS DISTINCT FROM NEW.profile_id) THEN
    RAISE EXCEPTION 'category parent must share profile scope (both NULL for system categories)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER categories_parent_scope_ck
AFTER INSERT OR UPDATE ON categories
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION ensure_category_parent_scope();

CREATE OR REPLACE FUNCTION ensure_workspace_category_parent_scope()
RETURNS trigger AS $$
DECLARE parent_workspace uuid;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT workspace_id INTO parent_workspace FROM workspace_categories WHERE id = NEW.parent_id;
  IF parent_workspace IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'workspace category parent must belong to same workspace';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER workspace_categories_parent_scope_ck
AFTER INSERT OR UPDATE ON workspace_categories
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION ensure_workspace_category_parent_scope();

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
      RAISE EXCEPTION 'account_scope_json contains account % that is not part of connection %', account_id, NEW.connection_id;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER workspace_connection_links_scope_ck
AFTER INSERT OR UPDATE ON workspace_connection_links
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_workspace_account_scope();

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

  FOR split_record IN SELECT jsonb_array_elements(NEW.splits)
  LOOP
    IF jsonb_typeof(split_record) <> 'object' OR NOT split_record ? 'amount_cents' THEN
      RAISE EXCEPTION 'each split must include amount_cents';
    END IF;
    total := total + (split_record ->> 'amount_cents')::bigint;
  END LOOP;

  SELECT amount_cents INTO base_amount FROM transactions WHERE id = NEW.transaction_id;
  IF base_amount IS NULL THEN
    RAISE EXCEPTION 'transaction not found for overlay';
  END IF;

  IF total <> base_amount THEN
    RAISE EXCEPTION 'split totals (%s) must equal transaction amount (%s)', total, base_amount;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transaction_overlays_splits_validate
BEFORE INSERT OR UPDATE ON transaction_overlays
FOR EACH ROW
EXECUTE FUNCTION validate_transaction_overlay_splits();

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

---

14. Neon Ops Notes

- Batch chatty writes (sessions, sync logs) via buffered inserts or COPY to avoid WAL pressure on shared storage
- Archive bulky raw_payload blobs (sync pages) to colder storage or partitioned tables when not needed for hot queries
- Monitor branch storage quotas; vacuum aggressively after large backfills and schedule pg_stat_statements reviews
- Consider partitioning `transactions` (time-based or by connection_id) once volumes grow to simplify retention and reduce vacuum pressure; BRIN indexes help, but partitions ease archival flows.
- Track pg_stat_statements for RLS-heavy queries to spot regressions caused by predicate complexity.

# Database Structure — Workspaces, Members, Views, and Workspace-Scoped Access

This file covers:

- Workspaces (collaboration units)
- Workspace members and role semantics
- Saved views and their child tables
- View sharing and public link access
- Account groups
- Workspace connection links and allowed accounts (access graph)
- Workspace categories (collaborative tree)
- Workspace category overrides (workspace-level remaps, resolution-side)

Use this whenever you’re touching collaboration, workspace-scoped access, or any UI that depends on saved views and category remaps.

For:

- Category semantics and resolution → see database-structure-categories-and-resolution.md  
- RLS policies and SQL → see database-structure-rls-and-access-control.md and database-structure-rls-policies-and-ddl.sql.md  

---

## 1. Workspaces

Table: workspaces

Purpose:

- Collaborative container for financial data and budgets.
- A workspace is owned by a profile but can have multiple members.

Core columns:

- id — UUID PK.
- owner_profile_id — FK to profiles(id) NOT NULL.
- name — TEXT.
- settings — JSONB:
  - Includes workspace-level configuration, e.g. `default_currency`, `timezone`.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.
- deleted_at — TIMESTAMPTZ NULL:
  - Soft-delete marker; archived workspaces no longer appear in regular queries.

Key semantics:

- settings.default_currency:
  - Defines the workspace base currency.
  - v1 budgets expect budgets (budget_plans.currency) to use this currency; mixed currencies are explicitly future work.
- Soft delete:
  - RLS predicates and default queries include `deleted_at IS NULL`.
  - Archived workspaces never surface in normal app flows.
  - Admin exports or maintenance tools must opt in explicitly and often use dedicated roles.

---

## 2. Workspace Members and Roles

Table: workspace_members

Purpose:

- Attach profiles to workspaces with roles and optional scope JSON.
- Drives collaboration, RLS predicates, and workspace visibility.

Core columns:

- id — UUID PK.
- workspace_id — FK to workspaces(id) NOT NULL.
- member_profile_id — FK to profiles(id) NOT NULL.
- role — TEXT NOT NULL with CHECK:
  - CHECK (role IN ('owner','admin','editor','viewer'))
- scope_json — JSONB:
  - Arbitrary per-member scoping rules (e.g. subset of features, account groups).
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.

Constraints and indexes:

- UNIQUE(workspace_id, member_profile_id)
  - A profile can have at most one membership row per workspace.
- GIN index on scope_json (if needed for feature gating queries).
- Additional index on (workspace_id, member_profile_id, role) recommended for role checks.

Role semantics (enforced by app logic + RLS):

- owner:
  - Full control over workspace (manage members, connections, budgets, views, billing, settings).
- admin:
  - Manage connections, views, budgets.
  - Invite/remove non-owner members.
  - Cannot transfer or revoke owner.
- editor:
  - Read/write data (transaction overlays, budgets, views).
  - Cannot manage workspace membership or billing.
- viewer:
  - Read-only access, scoped by workspace_connection_links/account scopes.

RLS usage:

- RLS policies rely heavily on role checks at the application layer and via membership lookups in workspace_members.
- Viewer paths are granted read-only access; write policies generally require role IN ('owner','admin','editor').

---

## 3. Saved Views and View Configuration

Saved views provide reusable filters, sort orders, and grouping logic over transactions and related data.

### 3.1 saved_views

Table: saved_views

Core columns:

- id — UUID PK.
- workspace_id — FK to workspaces(id) NOT NULL.
- name — TEXT.
- is_default — BOOL:
  - Indicates the workspace’s default view (UI-level semantics).
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.
- deleted_at — TIMESTAMPTZ NULL.

Soft deletion:

- Soft-deleted views disappear from normal queries.
- RLS predicates and default queries include `deleted_at IS NULL`.
- Archived views surface only in admin exports or maintenance flows.

RLS behavior:

- Access is limited to members of the workspace via workspace_members.
- Write operations are further limited by role (owner/admin/editor).

---

### 3.2 View configuration tables

Each saved view may have multiple configuration rows, all sharing the same basic structure:

Tables:

- view_filters
- view_sorts
- view_group_by
- view_rule_overrides
- view_category_groups

Shared core columns:

- id — UUID PK.
- view_id — FK to saved_views(id) NOT NULL.
- payload — JSONB:
  - Configuration blob for each table’s purpose:
    - view_filters: filter predicates (e.g. tags, date ranges, categories).
    - view_sorts: sort directives (e.g. sort by amount descending).
    - view_group_by: grouping directives (e.g. by category/month).
    - view_rule_overrides: per-view override rules.
    - view_category_groups: logical grouping of categories into UI groupings.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.

Semantics:

- These tables collectively define the behavior of a saved view without embedding complex logic in a single JSON column.
- RLS policies ensure only workspace members can read them and only authorized roles can modify them.

---

## 4. View Sharing and Public Links

### 4.1 view_shares

Table: view_shares

Purpose:

- Allow sharing of a saved view with specific profiles, optionally with edit permissions.

Core columns:

- id — UUID PK.
- view_id — FK to saved_views(id) NOT NULL.
- profile_id — FK to profiles(id) NOT NULL.
- can_edit — BOOL NOT NULL:
  - When true, the shared profile may edit the view configuration.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.

Semantics:

- Acts as a per-view ACL for profile-based sharing beyond workspace membership.
- RLS ensures:
  - Only workspace members can see or manage shares for that workspace.
  - Only owners/admins (and sometimes editors, depending on policy) can create/update shares.

---

### 4.2 view_links

Table: view_links

Purpose:

- Provide anonymous, read-only link-based access to a saved view, gated by token and optional passcode.

Core columns:

- id — UUID PK.
- view_id — FK to saved_views(id) NOT NULL.
- token_hash — JSONB NOT NULL UNIQUE:
  - Hashed link token in the canonical envelope format.
- passcode_hash — JSONB NULL:
  - Optional hashed passcode (same envelope format).
- expires_at — TIMESTAMPTZ NOT NULL:
  - Link becomes inactive when `expires_at <= now()`.
- created_by_profile_id — FK to profiles(id) NOT NULL:
  - Creator of the link (for auditing).
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.

Indexes:

- Index on (view_id).
- Index on (expires_at) for TTL sweeps.

Semantics:

- Links act as anonymous, read-only entry points into a workspace’s data, constrained to the specific view.
- Requests via view_link:
  - Execute under a constrained service role, not app_user.
  - Verify the hashed token (and optional passcode) before applying tailored RLS that only exposes the linked view’s data.
- Management APIs:
  - Continue to rely on per-profile policies via app_user.
- TTL and cleanup:
  - A scheduled job regularly revokes and purges expired links (rows with `expires_at <= now()`).

Security notes:

- Link tokens and passcodes are shown only once at creation.
- Verification is always via hash comparisons.
- Logs and database tables must never store raw tokens.

---

## 5. Account Groups

Account groups allow workspace-level grouping of bank accounts for UI organization and filtering.

### 5.1 account_groups

Table: account_groups

Core columns:

- id — UUID PK.
- workspace_id — FK to workspaces(id) NOT NULL.
- name — TEXT.
- color — TEXT:
  - Optional UI color hint.
- sort — INT:
  - Ordering index within the workspace.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.
- deleted_at — TIMESTAMPTZ NULL.

Soft delete:

- Soft-deleted groups are hidden from default queries and UIs (using `deleted_at IS NULL` predicates).

---

### 5.2 account_group_memberships

Table: account_group_memberships

Core columns:

- id — UUID PK.
- group_id — FK to account_groups(id) NOT NULL.
- account_id — FK to bank_accounts(id) NOT NULL.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.

Constraints:

- UNIQUE(group_id, account_id)
  - Prevents duplicate membership entries for the same group/account combination.

Semantics:

- Many-to-many relationship between account groups and bank accounts.
- RLS ensures:
  - Only workspace members with access to both the workspace and the accounts see these rows.

---

## 6. Workspace Connection Links and Allowed Accounts

The access graph for workspace-level financial data is defined primarily by:

- workspace_connection_links (JSON-based scopes)
- workspace_allowed_accounts (normalized account-level scopes)

### 6.1 workspace_connection_links

Table: workspace_connection_links

Purpose:

- Represent the grant of access from a connection owner’s data into a workspace, with optional account scoping.

Core columns:

- id — UUID PK.
- workspace_id — FK to workspaces(id) NOT NULL.
- connection_id — FK to connections(id) NOT NULL.
- granted_by_profile_id — FK to profiles(id) NOT NULL.
- account_scope_json — JSONB NULL:
  - NULL: all accounts on the connection are visible to the workspace.
  - Non-NULL: JSONB array of bank_accounts.id strings.
- expires_at — TIMESTAMPTZ NULL:
  - NULL: link is valid until explicitly revoked.
  - Non-NULL: link becomes inactive once `expires_at <= now()`.
- revoked_at — TIMESTAMPTZ NULL:
  - When non-NULL, link is inactive regardless of expiry.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.

Constraints and indexes:

- UNIQUE(workspace_id, connection_id)
  WHERE revoked_at IS NULL
  - Ensures at most one active link per workspace/connection pair.
- GIN index on account_scope_json for membership checks.
- Index on (workspace_id, connection_id, revoked_at, expires_at) to support RLS and hot path queries.

account_scope_json contract:

- NULL means “all accounts on the connection are in scope”.
- Non-NULL is a JSONB array of UUID strings (bank_accounts.id).
- Constraint trigger (validate_workspace_account_scope):
  - Ensures account_scope_json is either NULL or:
    - A JSON array of UUID strings.
    - Every referenced account:
      - Exists in bank_accounts.
      - Belongs to this connection.
      - Is not soft-deleted (`deleted_at IS NULL`).

Helper pattern:

- A deterministic helper function (e.g. unwrap using jsonb_array_elements_text) is used to test membership inside account_scope_json in queries and RLS policies.

Expiry and revocation:

- expires_at NULL:
  - Link is valid until `revoked_at` is set.
- When expires_at is non-NULL:
  - Link is inactive once `expires_at <= now()` even if `revoked_at` is still NULL.
- RLS policies and soft-delete alignment:
  - Predicates generally include:
    - revoked_at IS NULL
    - (expires_at IS NULL OR expires_at > now())
  - Inactive links remain in the DB but are hidden from normal queries.

Access graph canonical model:

- connections are owned by connections.owner_profile_id.
- A workspace sees a connection’s data only if:
  1) The viewing profile is a member of the workspace (via workspace_members), and
  2) The workspace has been granted scope via:
     - workspace_connection_links (JSON scopes), and/or
     - workspace_allowed_accounts (normalized projection).
- All access-control reasoning around workspace visibility assumes this flow is the single source of truth.

---

### 6.2 workspace_allowed_accounts (normalized scope)

Table: workspace_allowed_accounts

Purpose:

- Normalized, account-level projection of workspace_connection_links.account_scope_json.
- Optimized for queries that join directly by bank_account_id instead of scanning JSON.

Core columns:

- id — UUID PK.
- workspace_id — FK to workspaces(id) NOT NULL.
- bank_account_id — FK to bank_accounts(id) NOT NULL.
- granted_by_profile_id — FK to profiles(id) NOT NULL.
- revoked_at — TIMESTAMPTZ NULL.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().

Constraints and indexes:

- UNIQUE(workspace_id, bank_account_id)
  WHERE revoked_at IS NULL
- Index on (workspace_id, bank_account_id, revoked_at) to support access checks and RLS.

Semantics:

- Pure projection:
  - Derived from workspace_connection_links.account_scope_json.
  - Background jobs (and migrations) regenerate this table from JSON scopes.
- Do not mutate this table directly:
  - It must not be treated as an alternate source of truth.
  - Application logic should always treat workspace_connection_links as canonical and consider workspace_allowed_accounts a cache/projection.

RLS alignment:

- Predicates align with link semantics:
  - revoked_at IS NULL in RLS and partial indexes.
- Inactive projections:
  - Soft-delete semantics ensure revoked rows no longer participate in access checks.

Helper function (not for RLS):

- workspace_allows_account(workspace uuid, bank_account uuid) returns boolean:
  - Checks existence of an active row in workspace_allowed_accounts or a matching JSON entry in workspace_connection_links.
  - This function is intended for application-level helpers, not for use inside RLS on these tables (to avoid recursion).

---

## 7. Workspace Categories (Collaborative Tree)

Full semantics and resolution behavior (including workspace_category_overrides) are described in database-structure-categories-and-resolution.md. This section focuses on workspace-side relational structure.

### 7.1 workspace_categories

Table: workspace_categories

Purpose:

- Shared category tree scoped to a workspace.
- Supports collaborative categorization separate from system and profile-level trees.

Core columns:

- id — UUID PK.
- workspace_id — FK to workspaces(id) NOT NULL.
- parent_id — UUID NULL REFERENCES workspace_categories(id) DEFERRABLE INITIALLY DEFERRED.
- slug — TEXT.
- name — TEXT.
- sort — INT.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.
- deleted_at — TIMESTAMPTZ NULL.
- color — TEXT NULL (optional UI color).

Uniqueness:

- UNIQUE(workspace_id, slug)
  WHERE deleted_at IS NULL

Indexes:

- Index on (workspace_id, parent_id) for tree traversals.
- Additional indexes on (workspace_id, deleted_at) if needed for hot paths.

Parent scope constraint:

- Constraint trigger (ensure_workspace_category_parent_scope):
  - Ensures parent.workspace_id = child.workspace_id.
  - Enforced as DEFERRABLE INITIALLY DEFERRED to support bulk inserts/updates.

Soft deletion:

- deleted_at NOT NULL marks archived categories.
- RLS and default queries hide soft-deleted rows.
- Admin or historical exports may explicitly include archived categories when needed.

---

### 7.2 workspace_category_overrides (workspace-level remaps)

Table: workspace_category_overrides

Purpose:

- Represent workspace-level remaps of categories used in resolution flows.
- They affect how categories are interpreted within a workspace (including budgeting).

Core columns:

- id — UUID PK.
- workspace_id — FK to workspaces(id) NOT NULL.
- source_category_id — FK workspace_categories(id) NULL.
- target_category_id — FK workspace_categories(id) NULL.
- system_source_category_id — FK categories(id) NULL.
- system_target_category_id — FK categories(id) NULL.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.
- deleted_at — TIMESTAMPTZ NULL.

Uniqueness:

- UNIQUE(workspace_id, COALESCE(source_category_id, system_source_category_id))
  WHERE deleted_at IS NULL

CHECK constraint:

- Ensures exactly one source and one target domain is used:
  - (source_category_id IS NOT NULL AND system_source_category_id IS NULL)
    OR (source_category_id IS NULL AND system_source_category_id IS NOT NULL)
  - AND the same pattern for target_category_id vs system_target_category_id.

Semantics:

- Workspace overrides may:
  - Map a system category to:
    - Another system category, or
    - A workspace category.
  - Map a workspace category to:
    - Another workspace category, or
    - (rarely) a system category.
- Resolution:
  - For profile-aware categories:
    - workspace_category_overrides are applied after view overrides and before profile overrides.
  - For workspace-wide aggregates (like budget_actuals):
    - workspace_category_overrides finalize the category for workspace-level reporting.

RLS:

- Access is limited to workspace members.
- Creation/modification is allowed only to roles with elevated permissions (owner/admin, and sometimes editor).

---

## 8. Overlay Precedence (Workspace-Aware View)

While the detailed precedence and helper functions are documented in database-structure-categories-and-resolution.md, the key workspace-oriented principle is:

- Category overrides are layered as:

  - transaction_overlays.category_id
  - view_category_overrides
  - workspace_category_overrides
  - profile_category_overrides
  - transactions.system_category_id

- Workspace and view overrides operate in terms of:
  - System categories (categories table), and
  - Workspace categories (workspace_categories table),
  - Never introducing a third category tree.

Workspace-scoped overrides:

- Only apply once a non-null current_workspace_category exists or when a system category is explicitly mapped.
- Are designed so that all derived views (including budget_actuals) use the same underlying categories as the UI.

Any change to workspace_category_overrides, workspace_categories, or view_category_overrides must keep these invariants in sync across:

- database-structure-categories-and-resolution.md
- database-structure-connections-and-ledger.md (if queries rely on categories)
- database-structure-budgets.md (for budget_actuals)
- database-structure-constraints-indexes-and-triggers.md (for related constraints and indexes)

---

## 9. Summary: Workspace and View Responsibilities

- workspaces:
  - Own collaboration context, currency settings, and default configuration.
- workspace_members:
  - Control who can read/write within a workspace, with roles and scope_json.
- saved_views (+ children):
  - Define reusable configurations for viewing/segmenting transactions and budget data.
- view_shares:
  - Share a view with specific profiles, optionally granting edit rights.
- view_links:
  - Provide anonymous, token-based, read-only access to a view within strict constraints and TTL.
- account_groups / account_group_memberships:
  - Group bank accounts for convenience and filtering.
- workspace_connection_links:
  - Canonical source for granting workspace access to a connection’s data, including JSON-scoped accounts.
- workspace_allowed_accounts:
  - Normalized projection of per-account access derived from links.
- workspace_categories and workspace_category_overrides:
  - Collaborative category tree and workspace-level remaps that influence reporting and budgeting.

When modifying any workspace or view behavior:

1. Check this file for relational and semantic constraints.  
2. Check database-structure-categories-and-resolution.md for category precedence.  
3. Check database-structure-rls-and-access-control.md for RLS expectations.  
4. Update database-structure-constraints-indexes-and-triggers.md and database-structure-migrations-ops-and-testing.md to preserve constraints and tests.

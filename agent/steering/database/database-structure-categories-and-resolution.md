# Database Structure — Categories, Overrides, and Resolution

This file covers:

- System and profile category trees (`categories`)
- Per-profile overrides (`profile_category_overrides`)
- Workspace and view-level category trees/overrides (how they interact with resolution)
- Canonical category resolution order
- Implementation helpers:
  - effective_transaction_category(...)
  - effective_workspace_category(...)

Use this whenever you are working on anything that affects transaction categorization, category trees, or remapping rules.

For workspace/view table wiring and collaboration semantics more broadly, also load:
- database-structure-workspaces-and-views.md

---

## 1. Categories (System + Profile)

Table: categories

Purpose:
- Holds both system-wide and profile-specific category trees.
- System categories are shared defaults; profile categories are private to each profile.

Core columns:

- id — UUID PK.
- profile_id — UUID FK to profiles(id), nullable.
  - NULL: system default categories (shared tree).
  - Non-NULL: user-specific categories.
- parent_id — UUID NULL REFERENCES categories(id) DEFERRABLE INITIALLY DEFERRED.
  - Defines a tree structure.
  - Parent and child must share the same profile scope (both NULL for system categories, or both owned by the same profile).
- slug — TEXT.
  - Stable identifier used for uniqueness and mapping.
- name — TEXT.
  - Display name.
- sort — INT.
  - Optional sort order.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.
- deleted_at — TIMESTAMPTZ NULL.
  - Soft-delete marker.

Key constraints and indexes:

- Scoped slug uniqueness:

    UNIQUE (COALESCE(profile_id, '00000000-0000-0000-0000-000000000000'), slug)
    WHERE deleted_at IS NULL

  - Uses ZERO_UUID sentinel for system categories (profile_id NULL).
  - Prevents clashes between system and profile categories with same slug.

- Indexes:
  - Index on parent_id for tree traversal.
  - Additional indexes on (profile_id, deleted_at) or similar where needed by hot paths.

Semantics:

- System categories:
  - Rows with profile_id IS NULL.
  - Represent the canonical, seeded category tree (e.g. default spending categories).
  - Shared across all profiles and workspaces.
- Profile categories:
  - Rows with profile_id NOT NULL.
  - Private to that profile; do not leak across users.
- Seed data:
  - Must include a canonical “uncategorized” system category.
  - Ingestion maps missing provider categories to this system slug instead of leaving system_category_id NULL.

Soft deletion:

- deleted_at NOT NULL marks rows as archived.
- RLS and default queries hide soft-deleted categories.
- Historical/admin exports that need archived categories must opt in explicitly (dedicated roles or flags).

Parent scope constraint:

- A constraint trigger enforces that:

  - If parent_id IS NOT NULL:
    - parent.profile_id must equal child.profile_id
    - or both must be NULL (system tree).

- This ensures:
  - System roots only parent other system nodes.
  - Profile-owned categories cannot mix scope with system or other profiles.

Trigger (conceptual):

- ensure_category_parent_scope() trigger:
  - On INSERT/UPDATE:
    - If NEW.parent_id IS NULL: allow.
    - Else:
      - Fetch parent_profile from categories(parent_id).
      - Raise if parent_profile differs from NEW.profile_id (treat NULL/NULL as equal for system).

---

## 2. Profile Category Overrides

Table: profile_category_overrides

Purpose:
- Let a profile remap an existing category (system or profile) to another category in its own scope.

Core columns:

- id — UUID PK.
- profile_id — FK to profiles(id) NOT NULL.
- source_category_id — FK to categories(id) NOT NULL.
  - The category being overridden for this profile.
- target_category_id — FK to categories(id) NULL.
  - The category that replaces source_category_id for this profile.
  - Can reference:
    - System categories (profile_id NULL).
    - Profile-owned categories (profile_id = this profile).
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.
- deleted_at — TIMESTAMPTZ NULL.

Uniqueness:

- UNIQUE(profile_id, source_category_id) WHERE deleted_at IS NULL

Semantics:

- There is at most one active override per (profile, source_category_id).
- Target category cannot be forced to a workspace scope here; these are strictly profile-level remaps.
- When applied at the end of resolution:
  - current_category is replaced by target_category_id.
  - current_workspace_category is cleared (NULL) to indicate the final category is profile-specific.

Resolution role:

- profile_category_overrides are the last step in the canonical precedence chain.
- They apply after workspace/view overrides and are specific to a given profile.

---

## 3. Workspace and View Category Structures (Resolution-Specific View)

Full workspace/view table specs live in database-structure-workspaces-and-views.md. This section focuses only on the aspects relevant to category resolution.

### 3.1 workspace_categories

Purpose:
- Shared category tree at workspace level.
- Represents collaborative categories that all workspace members see.

Key resolution-related columns:

- id — UUID PK.
- workspace_id — FK to workspaces(id) NOT NULL.
- parent_id — UUID NULL REFERENCES workspace_categories(id) DEFERRABLE INITIALLY DEFERRED.
- slug — TEXT.
- name — TEXT.
- color — TEXT NULL (optional display).

Uniqueness:

- UNIQUE(workspace_id, slug) WHERE deleted_at IS NULL

Parent scope:

- Constraint trigger (ensure_workspace_category_parent_scope):
  - Ensures parent.workspace_id = child.workspace_id.

---

### 3.2 workspace_category_overrides

Purpose:
- Workspace-level remaps that adjust how categories appear within a workspace, without changing system/profile trees.

Key resolution-related columns:

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

Source/target exclusivity:

- CHECK constraint enforces:
  - Exactly one of (source_category_id, system_source_category_id) is non-null.
  - Exactly one of (target_category_id, system_target_category_id) is non-null.

Semantics:

- Two types of overrides:

  1) System-source override:
     - system_source_category_id is set.
     - Optionally remaps to:
       - system_target_category_id (new system mapping), or
       - target_category_id (workspace category target).

  2) Workspace-source override:
     - source_category_id (workspace category) is set.
     - Remaps to:
       - system_target_category_id (rare),
       - or target_category_id (workspace category).

- In practice:
  - Most workspace overrides will map either:
    - system category → workspace category, or
    - workspace category → workspace category.

Resolution role (workspace-level):

- They apply after view overrides (for workspace-aware projections) and before profile overrides.
- For workspace-aware views (e.g., budgeting aggregates):
  - workspace_category_overrides determine the final workspace_category_id.

---

### 3.3 view_category_overrides

Purpose:
- Per-view remaps layered on top of system/workspace categories.
- Used to customize category presentation for a specific saved view.

Key resolution-related columns:

- id — UUID PK.
- view_id — FK saved_views(id) NOT NULL.
- source_category_id — FK workspace_categories(id) NULL.
- target_category_id — FK workspace_categories(id) NULL.
- system_source_category_id — FK categories(id) NULL.
- system_target_category_id — FK categories(id) NULL.
- created_at — TIMESTAMPTZ NOT NULL DEFAULT now().
- updated_at — TIMESTAMPTZ NOT NULL.
- deleted_at — TIMESTAMPTZ NULL.

Uniqueness:

- UNIQUE(view_id, COALESCE(source_category_id, system_source_category_id))
  WHERE deleted_at IS NULL

Source/target exclusivity:

- CHECK constraint mirrors workspace_category_overrides:
  - Exactly one of (source_category_id, system_source_category_id) is non-null.
  - Exactly one of (target_category_id, system_target_category_id) is non-null.

Semantics:

- View overrides can:
  - Remap a system category to another system category or a workspace category.
  - Remap a workspace category to another workspace category.
- They are layered per saved view and are only applied when:
  - The caller provides a view_id, and
  - The requester is a member of the view’s workspace.

Resolution role:

- View overrides are applied early for profile-aware resolution (after overlays).
- For workspace-wide projections, view overrides sit on top of system mapping, before workspace overrides.

---

## 4. Canonical Category Resolution Order

Effective category lookups must always use the same precedence rules, whether implemented via SQL functions or via explicit JOINs.

### 4.1 Precedence Chain

For a transaction’s effective category:

1) transaction_overlays.category_id  
   - Per-transaction exceptions (per-profile).
   - If present (and overlay not soft-deleted), this category replaces the base mapping.

2) view_category_overrides  
   - Per saved view, optional.
   - Applies only when:
     - A view_id is present, and
     - The caller is a member of the view’s workspace.
   - Can remap either:
     - System category, or
     - Current workspace category.

3) workspace_category_overrides  
   - Workspace-level remaps.
   - Applies when a workspace_id is present.
   - Similar source/target semantics as view overrides but scoped to workspace.

4) profile_category_overrides  
   - Profile-level remaps.
   - Final user-specific remap step.
   - Clearing current_workspace_category indicates a profile-specific category.

5) transactions.system_category_id  
   - Baseline mapping.
   - Set by ingestion from provider data + system rules.
   - If a transaction reaches the resolver with system_category_id IS NULL:
     - Functions return (NULL, NULL, 'system_mapping').
     - This is treated as data hygiene debt; ingestion/backfills must fix it.
     - Overrides do not attempt to match NULL.

Important notes:

- Workspace-scoped source_category_id rules only fire after a prior override has produced a non-null current_workspace_category.
- Profile overrides intentionally clear current_workspace_category so downstream callers know the final category is profile-specific.
- Category trees are limited to exactly two sources:
  - System/profile categories in categories.
  - Workspace categories in workspace_categories.
- Building a third category tree elsewhere is forbidden; derived views must reference one of these canonical tables.

---

## 5. Implementation Helpers

Two helper functions encapsulate the resolution logic:

- effective_transaction_category(...)
- effective_workspace_category(...)

These are defined in SQL (plpgsql) and can be used directly by queries or treated as reference behavior for JOIN-based plans.

### 5.1 effective_transaction_category

Signature (conceptual):

- effective_transaction_category(
    p_transaction_id uuid,
    p_profile_id uuid,
    p_workspace_id uuid DEFAULT NULL,
    p_view_id uuid DEFAULT NULL
  )
- Returns TABLE (
    category_id uuid,
    workspace_category_id uuid,
    source text
  )

Behavior:

- Inputs:
  - p_transaction_id — transaction to resolve.
  - p_profile_id — profile for which to resolve.
  - p_workspace_id — optional workspace context.
  - p_view_id — optional view context.

- Output:
  - category_id — final category UUID (system/profile).
  - workspace_category_id — effective workspace category UUID, if any.
  - source — text label describing the last influencing layer:
    - 'overlay'
    - 'view_override'
    - 'workspace_override'
    - 'profile_override'
    - 'system_mapping'

High-level algorithm:

1) Overlay layer:

   - Look up overlay_category from transaction_overlays where:
     - transaction_id = p_transaction_id
     - profile_id = p_profile_id
     - deleted_at IS NULL
   - If found:
     - current_category := overlay_category
     - current_workspace_category := NULL
     - last_source := 'overlay'
   - Else:
     - Select system_category_id from transactions where id = p_transaction_id
     - current_category := system_category_id
     - current_workspace_category := NULL
     - last_source := 'system_mapping'

2) View overrides (when p_view_id IS NOT NULL and current_category IS NOT NULL):

   - Join view_category_overrides vco and saved_views sv:
     - vco.view_id = p_view_id
     - vco.deleted_at IS NULL
     - sv.id = vco.view_id
     - Ensure requester is a member of sv.workspace via workspace_members.
   - Match either:
     - vco.system_source_category_id = current_category, or
     - vco.source_category_id = current_workspace_category
   - If a matching row is found:
     - If vco.system_target_category_id IS NOT NULL:
       - current_category := vco.system_target_category_id
     - Else:
       - current_category stays the same.
     - current_workspace_category := vco.target_category_id
     - last_source := 'view_override'

3) Workspace overrides (when p_workspace_id IS NOT NULL and current_category IS NOT NULL):

   - Query workspace_category_overrides wco:
     - wco.workspace_id = p_workspace_id
     - wco.deleted_at IS NULL
   - Match either:
     - wco.system_source_category_id = current_category, or
     - wco.source_category_id = current_workspace_category
   - If a matching row is found:
     - If wco.system_target_category_id IS NOT NULL:
       - current_category := wco.system_target_category_id
     - Else:
       - current_category stays the same.
     - current_workspace_category := wco.target_category_id
     - last_source := 'workspace_override'

4) Profile overrides (when current_category IS NOT NULL):

   - Query profile_category_overrides pco:
     - pco.profile_id = p_profile_id
     - pco.deleted_at IS NULL
     - pco.source_category_id = current_category
   - If found:
     - current_category := pco.target_category_id
     - current_workspace_category := NULL
     - last_source := 'profile_override'

5) Return:

   - Return current_category, current_workspace_category, last_source.

Usage:

- Profile-aware queries should:

    SELECT t.*, ec.category_id, ec.workspace_category_id, ec.source
    FROM transactions t
    CROSS JOIN LATERAL effective_transaction_category(
      t.id,
      current_setting('app.profile_id', true)::uuid,
      current_setting('app.workspace_id', true)::uuid,
      :view_id
    ) ec
    ...

- This ensures the UI and API share consistent effective category behavior.

---

### 5.2 effective_workspace_category

Signature (conceptual):

- effective_workspace_category(
    p_transaction_id uuid,
    p_workspace_id uuid,
    p_view_id uuid DEFAULT NULL
  )
- Returns TABLE (
    category_id uuid,
    workspace_category_id uuid,
    source text
  )

Behavior:

- Inputs:
  - p_transaction_id — transaction id.
  - p_workspace_id — workspace context.
  - p_view_id — optional view id.

- Output:
  - category_id — final system category id (after any remaps).
  - workspace_category_id — final workspace category id, if any.
  - source — text label describing the last influencing layer:
    - 'system_mapping'
    - 'view_override'
    - 'workspace_override'

High-level algorithm:

1) Start from system mapping:

   - Select system_category_id from transactions where id = p_transaction_id.
   - current_category := system_category_id.
   - current_workspace_category := NULL.
   - last_source := 'system_mapping'.

2) View overrides (if p_view_id IS NOT NULL):

   - Join saved_views sv and view_category_overrides vco:
     - sv.id = p_view_id
     - sv.workspace_id = p_workspace_id
     - vco.view_id = sv.id
     - vco.deleted_at IS NULL
   - Match either:
     - vco.system_source_category_id = current_category, or
     - vco.source_category_id = current_workspace_category
   - If found:
     - If vco.system_target_category_id IS NOT NULL:
       - current_category := vco.system_target_category_id
     - Else:
       - current_category stays the same.
     - current_workspace_category := vco.target_category_id
     - last_source := 'view_override'.

3) Workspace overrides:

   - Query workspace_category_overrides wco:
     - wco.workspace_id = p_workspace_id
     - wco.deleted_at IS NULL
   - Match either:
     - wco.system_source_category_id = current_category, or
     - wco.source_category_id = current_workspace_category
   - If found:
     - If wco.system_target_category_id IS NOT NULL:
       - current_category := wco.system_target_category_id
     - Else:
       - current_category stays the same.
     - current_workspace_category := wco.target_category_id
     - last_source := 'workspace_override'.

4) Return:

   - Return current_category, current_workspace_category, last_source.

Usage:

- Workspace-wide aggregates, such as budget_actuals, should:

    SELECT t.*, ew.category_id, ew.workspace_category_id, ew.source
    FROM transactions t
    CROSS JOIN LATERAL effective_workspace_category(
      t.id,
      :workspace_id,
      :view_id
    ) ew
    ...

- This keeps materialized aggregates (like budget_actuals) profile-agnostic and aligned with workspace/view remaps.

---

## 6. Performance and Testing Guidance

To keep category resolution correct and efficient:

- High-volume analytics (budget refreshes, exports):
  - Prefer direct JOINs against override tables (view/workspace/profile) using the canonical precedence logic rather than calling the UDF for each row.
  - Use the same precedence order:
    - overlay → view → workspace → profile → system.
  - Keep covering indexes on overrides for fast lookups:
    - view_category_overrides:
      - (view_id, system_source_category_id, deleted_at)
      - (view_id, source_category_id, deleted_at)
    - workspace_category_overrides:
      - (workspace_id, system_source_category_id, deleted_at)
      - (workspace_id, source_category_id, deleted_at)
    - profile_category_overrides:
      - (profile_id, source_category_id, deleted_at)

- Tests:
  - A pgTAP test suite (e.g. tooling/tests/pgtap/effective_category.sql) should:
    - Generate randomized combinations of:
      - system categories,
      - workspace categories,
      - overlays,
      - profile overrides,
      - workspace overrides,
      - view overrides.
    - Compare:
      - effective_transaction_category / effective_workspace_category outputs, vs.
      - An equivalent SQL JOIN implementation using the documented precedence.
    - Assert that all combinations match, preventing precedence regressions.

- Invariance:
  - Every resolver (SQL helper, SDK, analytics export) must honor the same precedence order so:
    - The UI.
    - Direct API consumers.
    - Analytical exports.
    - All see the same effective categories for the same transaction and context.

If you are modifying category trees, overrides, or resolution helpers, update:

- This file (for semantics).
- database-structure-constraints-indexes-and-triggers.md (for indexes/constraints).
- database-structure-budgets.md (if budget_actuals uses category behavior you changed).
- database-structure-migrations-ops-and-testing.md (for tests and validation).

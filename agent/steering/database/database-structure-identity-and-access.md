agent/steering/database-structure-identity-and-access.md
# Database Structure — Identity, Profiles, Subscriptions, API Keys

This file covers:

- Auth-core identity tables (users, user_identities, auth_sessions, refresh_tokens, verification_tokens, api_keys, session_transfer_tokens)
- Profiles and subscriptions (domain-level identity, billing linkage)
- API keys (PATs) and their ownership rules

Use this when you’re touching auth, identity, or per-user access surfaces. RLS policies and raw SQL live in `database-structure-rls-and-access-control.md` and `database-structure-rls-policies-and-ddl.sql.md`.

---

## 1. Auth / Identity (auth-core tables)

Auth-core owns identity and session tables. Auth.js adapters and schemas are not used in this repo; there is no legacy compatibility requirement.

- Token model: JWT access tokens (short-lived) + opaque refresh tokens (rotated, hash envelopes) + PATs (opaque, hash envelopes) as described in `docs/auth-migration/end-auth-goal.md`.
- Key tables:
  - `users` — canonical auth user; includes default workspace/profile linkage.
  - `user_identities` — external identity linkage (Google, etc.).
  - `auth_sessions` — session records with MFA level and device metadata.
  - `refresh_tokens` — rotated refresh tokens (family_id, last4, hash_envelope, scopes).
  - `verification_tokens` — opaque tokens for email verification/passwordless flows (hash_envelope).
  - `session_transfer_tokens` — short-lived tokens to bridge mobile OAuth flows.
  - `api_keys` — PATs; workspace- or user-scoped with scope arrays and hash_envelope.
- Access pattern:
  - Use auth-core repositories/services; do not query these tables directly from apps.
  - RLS/GUCs: set `app.user_id`, `app.profile_id` (when applicable), `app.workspace_id`, `app.mfa_level`, `app.service_id` per request; clear between pool usages.

---

## 2. Profiles

Profiles represent domain-level identity and preferences, distinct from auth-core `users`. All core application tables use `profiles.id` (not `users.id`) as the key for ownership.

Table: `profiles`

Core columns:

- `id` — UUID PK.
- `user_id` — FK to `users(id)` NOT NULL, UNIQUE:
  - v1 assumption: one profile per auth-core user.
- `timezone` — TEXT:
  - User’s preferred timezone; used for date bucketing and UI defaults.
- `currency` — `VARCHAR(3) CHECK (char_length(currency) = 3)`:
  - Preferred currency for personal, non-workspace flows.
- `settings` — JSONB:
  - Arbitrary user-level settings (feature flags, preferences, etc.).
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Uniqueness and future evolution:

- There is a UNIQUE constraint on `user_id` in v1.
- Supporting multiple profiles per user later will require:
  - Dropping this uniqueness constraint.
  - Introducing application-level semantics (e.g. `primary_profile_id` on `users`).
  - Updating any logic that assumes 1:1 between `users` and `profiles`.

RLS and roles:

- RLS on `profiles` ensures:
  - A profile can see and mutate only its own row.
- Detailed policies and SQL definitions are in:
  - `database-structure-rls-and-access-control.md`
  - `database-structure-rls-policies-and-ddl.sql.md`

---

## 3. Subscriptions

Subscriptions link profiles to Stripe billing state and control seat/slot limits.

Table: `subscriptions`

Core columns:

- `id` — UUID PK.
- `profile_id` — FK to `profiles(id)` NOT NULL.
- `stripe_customer_id` — TEXT, optional but usually present once billing is set up.
- `stripe_subscription_id` — TEXT, optional; null when not yet subscribed or in trial-only scenarios.
- `slot_limit` — INT:
  - Configurable limit on a resource (e.g., number of connections, bank accounts, or workspaces).
  - Exact semantics are scoped at the application/service layer.
- `status` — TEXT with CHECK constraint:
  - `CHECK (status IN ('trialing','active','past_due','canceled','incomplete'))`
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Indexes:

- Index on `(profile_id)` for quick lookups.
- Optional index on `(status)` to filter active/trialing subscriptions quickly.

RLS behavior:

- RLS ensures:
  - A profile sees only its own `subscriptions` row(s).
- The policy definition is in `database-structure-rls-policies-and-ddl.sql.md` (see `subscriptions_owner`).

Billing flows and invariants:

- Application code must ensure Stripe webhooks and dashboard changes are reconciled with this table.
- Slot limits enforced by the app must read from `subscriptions.slot_limit` atomically with the relevant creation actions (e.g., provisioning connections or workspaces).

---

## 4. API Keys (PATs)

API keys provide programmatic access (PATs) for UI and external integrations. They are always owned by a profile and may optionally be scoped to a workspace.

Table: `api_keys`

Core columns:

- `id` — UUID PK.
- `user_id` — FK to `users(id)` NOT NULL.
- `profile_id` — FK to `profiles(id)` NOT NULL.
- `workspace_id` — FK to `workspaces(id)` NULL:
  - NULL → personal key.
  - Non-NULL → workspace-scoped key.
- `name` — TEXT:
  - Human-readable label for the key.
- `key_hash` — JSONB UNIQUE:
  - Stores hashed token envelope: algorithm, key_id, hash.
  - Format is shared with other token-hash columns; see `database-structure-tokens-and-secrets.md`.
- `scopes` — JSONB DEFAULT `'[]'`:
  - List of fine-grained API scopes, modeled as JSON (e.g. `["transactions:read", "budgets:write"]`).
- `last_used_at` — TIMESTAMPTZ, optional:
  - Updated by backend on authenticated calls.
- `expires_at` — TIMESTAMPTZ, nullable:
  - Key expires and becomes unusable when `expires_at <= now()`.
- `revoked_at` — TIMESTAMPTZ, nullable:
  - Key is considered inactive once revoked; RLS and queries treat `revoked_at IS NULL` as active.
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Key ownership semantics:

- Keys are always owned by a profile:
  - `profile_id` is NOT NULL.
- Keys may be:
  - Personal: `workspace_id IS NULL`.
  - Workspace-scoped: `workspace_id` points to a workspace where the profile is a member (and typically `owner` or `admin`).
- When a member is removed from a workspace:
  - Any workspace-scoped keys for that profile and workspace must be revoked in the same transaction to avoid dangling access.

Constraints and triggers:

- CHECK constraint to enforce profile ownership:
  - `CHECK (profile_id IS NOT NULL)`
- Constraint triggers:
  - `api_keys_validate_profile_link`:
    - DEFERRABLE INITIALLY DEFERRED.
    - Ensures that any `profile_id` on an `api_keys` row belongs to the same `user_id` (i.e. `profiles.user_id == user_id`).
  - `api_keys_validate_workspace_link`:
    - DEFERRABLE INITIALLY DEFERRED.
    - Ensures that when `workspace_id` is non-NULL:
      - The referenced workspace has a `workspace_members` row for the profile.
      - `role` is in `('owner','admin')` (or stricter, as defined at the RLS/policy layer).
- Indexes:
  - Index on `(user_id)`.
  - Index on `(profile_id)`.
  - Index on `(workspace_id)`.
  - Partial index on `(revoked_at IS NULL)` for active keys.
  - `key_hash` UNIQUE index.

Key hash envelope:

- `key_hash` stores JSON metadata:
  - Example structure: `{ "algo": "hmac-sha256", "key_id": "v1", "hash": "<base64>" }`
- Design choices:
  - JSONB is used instead of TEXT so:
    - The system can query by algorithm/key_id to identify keys needing rotation.
    - Multiple algorithms can coexist during phased rotations.
  - Secret material is never stored in plaintext; only the hash is persisted.

RLS and surface constraints:

- RLS for `api_keys` is designed so:
  - A user can see and manage only their own keys (`user_id = app.user_id`).
- Policy definition is in `database-structure-rls-policies-and-ddl.sql.md` (see `api_keys_self`).

Operational expectations:

- Key generation helpers:
  - Produce tokens in the canonical `<token_id>.<token_secret>` format.
  - Persist only the token hash envelope to `key_hash`, never the raw token.
  - Return the token to the caller exactly once (displayed in UI, never retrievable again).
- Rotation and auditing:
  - Rotation jobs may query `key_hash` for stale algorithms and flag or reissue keys.
  - `last_used_at` is updated via separate, batched writes to keep hot paths efficient.

---

## 5. Cross-Cutting Identity and Access Invariants

These invariants must hold across all identity/access tables:

- UUIDs everywhere:
  - All PKs and FKs use UUID types consistently (`@db.Uuid`).
- No plaintext secrets:
  - Session tokens, verification tokens, API keys, and view link tokens are all stored only as hashed envelopes (see tokens/secrets doc).
- Strong uniqueness:
  - `users.email_lower` is globally unique.
  - `accounts(provider, provider_account_id)` unique.
  - `sessions.session_token_hash` and `verification_tokens.token_hash` unique.
  - `api_keys.key_hash` unique.
- Timestamps:
  - All rows have `created_at` (and usually `updated_at`) as `TIMESTAMPTZ`.
- RLS:
  - Domain-level identity (profiles, api_keys, subscriptions) is protected via RLS and GUC-based context.
  - Auth-core tables are accessed via auth-core services with GUC-based context; do not bypass RLS with separate adapter roles.

For security-sensitive changes (e.g., token format or schema changes to these tables), always load:

- `database-structure-tokens-and-secrets.md`
- `database-structure-rls-and-access-control.md`
- `database-structure-rls-policies-and-ddl.sql.md`

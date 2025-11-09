agent/steering/database-structure-identity-and-access.md
# Database Structure — Identity, Profiles, Subscriptions, API Keys

This file covers:

- Auth.js identity tables (users, accounts, sessions, verification_tokens)
- How the Auth.js adapter must be aligned with the DB schema
- Profiles and subscriptions (domain-level identity, billing linkage)
- API keys (PATs) and their ownership rules

Use this when you’re touching auth, identity, or per-user access surfaces. RLS policies and raw SQL live in `database-structure-rls-and-access-control.md` and `database-structure-rls-policies-and-ddl.sql.md`.

---

## 1. Auth / Identity (Auth.js Tables)

Auth.js tables are the entry point for identity. They are accessed by a dedicated database role (e.g. `auth_service`) with `BYPASSRLS`. Application traffic uses `app_user` and never touches these tables directly.

RLS is intentionally disabled on these tables; security is enforced via:

- Hashed tokens (no plaintext)
- Strict uniqueness and timestamp contracts
- Clear separation between `auth_service` and `app_user` roles

### 1.1 users

Represents Auth.js identities.

Core columns:

- `id` — UUID PK.
- `email` — TEXT, original casing, not used for uniqueness.
- `email_lower` — TEXT NOT NULL UNIQUE, canonical lowercase email:
  - Must always be `LOWER(email)`.
  - This is the only column with a uniqueness constraint for emails.
- `emailVerified` — TIMESTAMPTZ, optional verification timestamp.
- `name` — TEXT, optional display name.
- `image` — TEXT, optional avatar URL.
- `password_hash` — TEXT, optional:
  - Stores bcrypt or similar password hashes (e.g. cost 12+).
  - Never stores plaintext passwords.
  - Column is NOT NULL when credentials-based login is enabled for the user.
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL, maintained via Prisma `@updatedAt`.

Notes:

- Optional non-unique index on `email` can exist for lookups by original casing.
- Uniqueness must be enforced on `email_lower` only; do not keep a UNIQUE index on `email`.

### 1.2 accounts

Represents OAuth / external accounts linked to a `user`.

Core columns:

- `id` — UUID PK.
- `user_id` — FK to `users(id)`, NOT NULL.
- `provider` — TEXT NOT NULL (e.g. `github`, `google`).
- `provider_account_id` — TEXT NOT NULL, provider-specific account identifier.
- `refresh_token` — encrypted (never plaintext).
- `access_token` — encrypted (never plaintext).
- `expires_at` — TIMESTAMPTZ, optional.
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Constraints and indexes:

- `UNIQUE (provider, provider_account_id)` — a user cannot have two rows for the same external account.
- Indexes on `user_id` (and often `(provider, provider_account_id)` via the UNIQUE index).

### 1.3 sessions (optional DB sessions)

Used when Auth.js is configured with DB-backed sessions instead of (or in addition to) JWT-only sessions.

Core columns:

- `id` — UUID PK.
- `user_id` — FK to `users(id)`, NOT NULL.
- `session_token_hash` — JSONB NOT NULL UNIQUE:
  - Stores a hashed representation of the session token, never plaintext.
  - Uses the shared JSONB envelope described in `database-structure-tokens-and-secrets.md`.
- `expires` — TIMESTAMPTZ NOT NULL, session expiration.
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Indexes and maintenance:

- Index on `(expires)` for TTL sweeps.
- Scheduled job purges expired sessions regularly to prevent unbounded growth.

Notes:

- No plaintext `sessionToken` column should exist.
- Only the token hash envelope and non-sensitive metadata are stored.

### 1.4 verification_tokens

Used for passwordless login, email verification links, etc.

Core columns:

- `id` — UUID PK.
- `identifier` — TEXT NOT NULL:
  - Usually an email or similar identifier for the recipient.
- `token_hash` — JSONB NOT NULL UNIQUE:
  - Hashed token envelope; no plaintext token storage.
- `expires` — TIMESTAMPTZ NOT NULL, token expiration time.
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Indexes and maintenance:

- Index on `(expires)` for TTL sweeps.
- Periodic job deletes expired verification tokens.

Contract with sessions:

- Both `sessions` and `verification_tokens` use the same token hash envelope format.
- This allows shared verification/rotation logic and consistent behavior.

### 1.5 Auth.js Adapter Access Pattern

- Auth.js flows run before a user/profile context exists, so:
  - A dedicated DB role (e.g. `auth_service`) with `BYPASSRLS` owns/queries the Auth.js tables.
  - Application traffic uses `app_user` with RLS on domain tables.
- Because these tables are pre-auth and accessed via `auth_service`:
  - RLS is not enabled on `users`, `accounts`, `sessions`, or `verification_tokens`.
  - Security relies on:
    - Hashed tokens.
    - Strong uniqueness constraints.
    - Separation between roles.

### 1.6 Adapter Alignment and Verification

The Prisma Auth.js adapter models must mirror the DB contract:

Adapter schema requirements:

- UUID PKs:
  - All primary keys are UUIDs with `@default(uuid())` (or SQL `gen_random_uuid()`), mapped as `@db.Uuid`.
- Email:
  - `email_lower` column is present, `TEXT NOT NULL UNIQUE`.
  - Legacy email uniqueness constraints on `email` must be dropped to avoid case collisions.
- Timestamps:
  - `created_at` and `updated_at` are `TIMESTAMPTZ`.
  - `created_at` uses `@default(now())`.
  - `updated_at` uses Prisma `@updatedAt`.
- Token storage:
  - Token material is stored only as digests:
    - `sessions.session_token_hash` (no plaintext session token).
    - `verification_tokens.token_hash` (no plaintext verification token).
  - Any plaintext token columns (e.g. `sessionToken`, `token`) must be removed during migration.

Auth.js configuration expectations:

- Adapter must be wired to use the Prisma models as defined above.
- Custom adapter hooks may be required to:
  - Ensure `email_lower` is set on user creation (e.g. custom `createUser`).
  - Hash tokens before persistence (custom session and verification token adapter methods).
- All tokens follow the canonical format described in `database-structure-tokens-and-secrets.md` (token envelope and HMAC hashing).

Testing expectations (packages/auth):

- Integration tests provision a Neon preview database with the finalized schema.
- Tests cover:
  - Email/password sign-up.
  - OAuth login.
  - Passwordless login via email magic link.
  - Email verification flows.
- Each test asserts:
  - UUID primary keys are used for all auth entities.
  - `email_lower` is non-null and unique.
  - Token hash columns are populated and no plaintext tokens remain.
- Tests run via:
  - `pnpm test --filter auth -- --run`
  - `DATABASE_URL` points to a disposable Neon branch.
- CI treats these tests as required before migrations touching Auth.js tables can merge.

---

## 2. Profiles

Profiles represent domain-level identity and preferences, distinct from Auth.js `users`. All core application tables use `profiles.id` (not `users.id`) as the key for ownership.

Table: `profiles`

Core columns:

- `id` — UUID PK.
- `user_id` — FK to `users(id)` NOT NULL, UNIQUE:
  - v1 assumption: one profile per Auth.js user.
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
  - Auth.js tables remain outside RLS but use separate roles.

For security-sensitive changes (e.g., token format or schema changes to these tables), always load:

- `database-structure-tokens-and-secrets.md`
- `database-structure-rls-and-access-control.md`
- `database-structure-rls-policies-and-ddl.sql.md`

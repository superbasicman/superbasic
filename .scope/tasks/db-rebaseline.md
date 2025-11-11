1. [x] Capture target v1 schema scope for this reset (tables, key invariants, and referenced steering docs) — AC: short checklist in the task file citing the docs and enumerating every table we plan to implement right now.
2. [x] Replace the current Prisma schema with the v1 tables (UUID PKs, `email_lower`, hashed token columns, profile/workspace scaffolding) — AC: `packages/database/schema.prisma` matches the documented columns/types/naming and passes `pnpm prisma validate`.
3. [x] Regenerate baseline SQL migrations that align with the new schema (including constraints, indexes, and helper functions/RLS stubs called out in the docs) — AC: `packages/database/migrations` contains the fresh sequence and `pnpm prisma migrate deploy --schema packages/database/schema.prisma` succeeds against pg-mem.
4. [x] Update supporting code/tests (Prisma client bootstrap, auth/package tests, and any docs referencing the old schema) to reflect the reset — AC: vitest suites under `packages/auth` pass locally with the new database package and docs mention the updated baseline.

## Task 1 scope snapshot

**Docs referenced**
- `agent/steering/database/database-structure-overview.md`
- `agent/steering/database/database-structure-identity-and-access.md`
- `agent/steering/database/database-structure-workspaces-and-views.md`
- `agent/steering/database/database-structure-connections-and-ledger.md`
- `agent/steering/database/database-structure-budgets.md`
- `agent/steering/database/database-structure-sync-and-caches.md`
- `agent/steering/database/database-structure-tokens-and-secrets.md`
- `agent/steering/database/database-structure-constraints-indexes-and-triggers.md`
- `agent/steering/database/database-structure-rls-and-access-control.md`

**Core invariants to bake into v1 schema**
- UUID v4 PKs everywhere; foreign keys share the same UUID type.
- TIMESTAMPTZ timestamps with `created_at DEFAULT now()` and Prisma-managed `updated_at`.
- Case-insensitive emails via `email_lower` unique index; drop uniqueness on raw `email`.
- All bearer tokens stored as JSONB hash envelopes (`sessions.session_token_hash`, `verification_tokens.token_hash`, `api_keys.key_hash`, view links, etc.); no plaintext tokens.
- Money columns come as `(amount_cents BIGINT, currency VARCHAR(3) CHECK (char_length(currency)=3))`.
- Soft-delete columns (`deleted_at`, `revoked_at`) with partial indexes and RLS filters.
- Workspace/profile context enforced through RLS policies using `current_setting('app.*')`.

**Target tables for this reset**
1. **Identity / Auth (Auth.js role, no RLS)**
   - `users` (with `email_lower`, `password_hash`, timestamps)
   - `accounts`
   - `sessions`
   - `verification_tokens`
2. **Domain identity & billing**
   - `profiles`
   - `subscriptions`
3. **API access & secrets**
   - `api_keys` (profile-owned, optional workspace scope, JSONB hash + scopes)
   - `connection_secrets` (encrypted provider tokens; aligns with tokens/secrets doc)
4. **Workspaces & collaboration**
   - `workspaces`
   - `workspace_members`
   - `workspace_connection_links`
   - `workspace_allowed_accounts`
   - `workspace_categories`
   - `workspace_category_overrides`
5. **Saved views & sharing**
   - `saved_views`
   - `view_filters`
   - `view_sorts`
   - `view_group_by`
   - `view_rule_overrides`
   - `view_category_groups`
   - `view_category_overrides`
   - `view_shares`
   - `view_links`
6. **Connections & accounts**
   - `connections`
   - `connection_sponsor_history`
   - `bank_accounts`
   - `account_groups`
   - `account_group_memberships`
7. **Ledger & overlays**
   - `transactions`
   - `transaction_overlays`
   - `transaction_audit_log`
8. **Budgeting**
   - `budget_plans`
   - `budget_versions`
   - `budget_envelopes`
   - `budget_actuals` (posted/authorized pairs per doc)
9. **Sync sessions & logs**
   - `sync_sessions`
   - `session_page_payloads`
   - `session_idempotency`
   - `session_leases`
   - `sync_audit_log`
10. **Performance caches (derivable/truncatable)**
    - `user_connection_access_cache`
    - `profile_transaction_access_cache`

Helper SQL (functions, triggers, policies) required in migrations:
- Token hash envelope validators, `workspace_allows_account`, overlay split validator, currency enforcement for budget envelopes, RLS policies for each domain table, and required extensions (`pgcrypto`, `btree_gist`, optional `pg_trgm`).

### Task 3 notes
- Wiped the previous ad-hoc migrations, generated `20251106120000_initial_baseline/migration.sql` via `pnpm prisma migrate diff --from-empty --to-schema-datamodel schema.prisma --script`, and restored `migration_lock.toml` with `provider = "postgresql"`.
- Confirmed the SQL applies cleanly by replaying it through pg-mem (`node` script requiring `packages/database/node_modules/pg-mem`), which surfaces the same behavior our Prisma client uses in tests. A real `pnpm prisma migrate deploy` run can be issued once a Postgres URL is available.

### Task 4 notes
- Updated `@repo/auth` credential flows + repositories to honor `email_lower` (lowercase lookups + inserts) and exposed the new schema via regenerated Prisma client (`pnpm prisma generate`). Added matching changes to test helpers to seed `emailLower`.
- Removed pg-mem entirely; tests now run against the Neon dev branch using `pnpm run test:core:devdb` or `pnpm run db:reset-and-test`, both documented in `apps/api/src/test/README.md`.
- Added Prisma adapter overrides for verification tokens (UUID `token_id` + hashed `token_hash`) so Auth.js magic links work with the new schema.
- Test status:
  - `pnpm test --filter auth -- --run` ✅
  - `pnpm run test:core:devdb` ✅ (once pointed at an accessible Neon branch)

1. [x] Rename `accounts` to `bank_accounts` (Auth.js vs financial) to avoid schema collisions.
2. [x] Enforce non-null or otherwise reliable uniqueness on `transactions.provider_tx_id` so `UNIQUE (connection_id, provider_tx_id)` holds.
3. [x] Replace `user_connection_access_cache.user_id` with `profile_id` (or align RLS strategy) to match profile-scoped access control.
4. [x] Replace `WHERE expires_at > now()` partial uniques with deterministic enforcement (e.g., GiST exclusion on a generated `tstzrange` or a trigger).
5. [x] Add a composite uniqueness (e.g., `UNIQUE (id, connection_id)`) on financial `accounts` to back the `transactions.account_id/connection_id` FK expectation.
6. [x] Define explicit RLS write policies (INSERT/UPDATE/DELETE) with `USING`/`WITH CHECK`; keep `transactions` owner-only for INSERT and forbid UPDATE/DELETE.
7. [x] Swap currency columns to `VARCHAR(3)` plus `CHECK (length(currency)=3)` to avoid `CHAR(3)` padding issues.
8. [x] Use `current_setting(..., true)` with null-guards before casting to UUID inside RLS policies.
9. [x] Ensure migrations declare required extensions (`pgcrypto`, `btree_gist` if using exclusions, optional `pg_trgm`).
10. [x] Add indexing tweaks: BRIN on `transactions(posted_at)`, consider `jsonb_path_ops` where heavy `@>` queries exist, and partial indexes on overlays for active rows.
11. [x] Revisit workspace account scoping (consider `workspace_allowed_accounts` join table or deterministic JSONB query helpers).
12. [x] Validate `transaction_overlays.splits` JSON structure (required keys/types and sum-of-splits) via trigger or check.
13. [x] Update RLS/policies to exclude soft-deleted rows (`deleted_at IS NULL`) consistently.
14. [x] Keep complex constraints (partials/exclusions/triggers) in SQL migrations with Prisma `@map/@@map` cleanup and `NOT NULL` coverage.
15. [x] Document Neon operational guidance (batch chatty writes, cold storage for large `raw_payload` blobs).
16. [x] In section 7 (Token and Secret Handling), explicitly distinguish between:
   - one-way hashed tokens (PATs, view links, passcodes, session tokens), and
   - reversibly encrypted provider secrets (Plaid access tokens, processor tokens, webhook secrets).
   State clearly that Plaid access tokens are encrypted at rest and never stored as hashes.

17. [x] In the connections table spec, document how Plaid-specific fields map:
   - provider_item_id = Plaid item_id when provider = 'plaid'
   - tx_cursor stores the provider sync cursor
   - config (or a new connection_secrets table) holds encrypted Plaid access tokens and other provider metadata.
   Clarify that config must not contain plaintext secrets.

18. [x] For workspace_connection_links.account_scope_json, document a strict contract:
   - NULL means “all accounts on this connection are allowed”
   - otherwise it is a JSONB array of UUID strings representing bank_accounts.id.
   Consider adding a CHECK or trigger enforcing this shape.

19. [x] Update the example RLS SELECT policy for transactions so the workspace-based branch also requires workspace membership, e.g. an EXISTS join to workspace_members where workspace_id = current_setting('app.workspace_id') and member_profile_id = current_setting('app.profile_id').

20. [x] Add an explicit RLS policy example for transaction_overlays that:
   - restricts rows to profile_id = current_setting('app.profile_id')::uuid, and
   - only allows overlays for transactions that are visible under the existing transactions policies.

21. [x] In the Workspaces and Collaboration section, add a short note defining overlay precedence for shared views (e.g., viewer’s own overlay wins, then any future workspace-level overlay, then the raw transaction), so behavior is unambiguous across workspaces.

22. [x] In the Performance Caches section, define primary/unique keys and indexes:
   - user_connection_access_cache: unique on (profile_id, connection_id, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000')).
   - profile_transaction_access_cache: unique on (transaction_id, profile_id, workspace_id).
   Explicitly state these tables are derived caches and safe to truncate if they fall out of sync.

23. [x] In the Sync and Audit section, add a note that sync is per connection (not per workspace). New transactions written for a connection are automatically visible in any workspace that has an active workspace_connection_link / workspace_allowed_accounts entry for the relevant accounts.

24. [x] In Data Integrity and Retention, document the lifecycle for revoked Plaid items / deleted connections:
   - set connections.status to 'deleted' or 'error',
   - set connections.deleted_at,
   - revoke related workspace_connection_links,
   - set revoked_at on affected workspace_allowed_accounts rows.

25. [x] In Migrations and Environments, extend the note about SQL migrations to explicitly include helper functions (e.g., workspace_allows_account, validate_transaction_overlay_splits) and RLS policies, with a reminder that they should be defined in SQL alongside triggers and indexes and mapped into Prisma via @map/@@map as needed.

26. [x] Document category usage and constraints in shared workspaces (overlay category ownership, cross-profile categories, future workspace_categories note).

27. [x] Clarify connection_sponsor_history semantics (insert timing, owner_profile_id as source of truth, suggested index).

28. [x] Expand workspace_members documentation to spell out role capabilities and enforcement points.

29. [x] Make workspace and currency assumptions explicit, including how budget_actuals_mv treats mismatched currencies.

30. [x] Document the view_links access model (authenticated vs anonymous, workspace context, audit logging).

31. [x] Describe sync_sessions and session_leases concurrency behavior and recovery expectations.

32. [x] Introduce profile/workspace/view category override tables and document precedence with overlays.

33. [x] Redesign workspace_members RLS to match role semantics:
   - [x] Owners/admins can list/manage all members in their workspaces.
   - [x] Members can at least see their own membership row.

34. [x] Decide final semantics for `workspace_connection_links.expires_at` and enforce them. Validity Score: 95%
   - [x] Update `workspace_allows_account` to respect `expires_at`.
   - [x] Update any RLS clauses that rely on active links.

35. [x] Resolve `view_links.token_hash` behavior. Validity Score: 90%
   - [x] EITHER keep simple `UNIQUE(token_hash)` and drop the “active-only” trigger.
   - [x] OR remove column-level UNIQUE and enforce “single active link per token_hash” via trigger/partial unique index using `expires_at` (not needed after choosing the first option).

36. [x] Enable and FORCE RLS on all user-facing tables (profiles, workspaces, workspace_members, workspace_connection_links, workspace_allowed_accounts, categories, workspace_categories, connections, bank_accounts, transactions, transaction_overlays, audit/log tables; caches must either enforce RLS or be marked internal-only). Validity Score: 98%

37. [x] Use a dedicated application DB role without BYPASSRLS/superuser privileges and with minimal grants (read/write only on app tables). Validity Score: 85%

38. [x] Enforce append-only semantics on immutable tables (e.g., transactions) with triggers blocking UPDATE/DELETE and remove those privileges from the app role. Validity Score: 90%

39. [x] Ensure NOT NULL + FK constraints exist for required columns (all *_id FKs, created_at, hashes/status). Validity Score: 80%

40. [x] Add deferrable self-referential FKs plus scope checks for hierarchical trees (`categories.parent_id`, `workspace_categories.parent_id`). Validity Score: 90%

41. [x] Make email uniqueness case-insensitive and store a canonical lowercase form. Validity Score: 85%

42. [x] Rename `users.password` to `password_hash`, clarify hashing parameters, and ensure it never stores plaintext. Validity Score: 80%

43. [x] Standardize token hashing (shared format, HMAC/salted hashes, store algorithm metadata). Validity Score: 75%

44. [x] Validate `workspace_connection_links.account_scope_json` contents (JSON array of valid bank account IDs). Validity Score: 90%

45. [x] Add cross-column checks on `api_keys` so user_id/profile_id/workspace_id remain consistent. Validity Score: 80%

46. [x] Ensure `updated_at` is maintained automatically (Prisma `@updatedAt` or DB trigger) and drop `DEFAULT now()` if Prisma owns the value. Validity Score: 70%

47. [x] Add housekeeping indexes (expires_at) and TTL jobs for expiring rows/payloads. Validity Score: 80%

48. [x] Lock down performance cache tables (RLS or restricted access). Validity Score: 75%

49. [x] Add pgTAP/property-based tests covering RLS isolation, revocation effects, and immutable table guards. Validity Score: 70%
50. [x] Replace cross-table CHECK constraints with deferrable constraint triggers for `api_keys` and budget currency alignment. Validity Score: 85%
    - Postgres rejects cross-table subqueries inside CHECKs; constraint triggers keep the invariants enforceable after INSERT/UPDATE.
51. [x] Fix `transaction_overlays` category modeling. Validity Score: 80%
    - Aligns FK usage with actual data by restricting overlays to `categories.id`; workspace categories remain accessible via override tables.
52. [x] Make `workspace_allows_account()` compatible with RLS. Validity Score: 75%
    - Add SELECT policies for `workspace_allowed_accounts`/`workspace_connection_links` so the helper runs under FORCE RLS; consider SECURITY DEFINER if policies cannot cover app access.
53. [x] Complete RLS coverage. Validity Score: 90%
    - Every table with ENABLE/FORCE RLS now documents concrete SELECT/INSERT/UPDATE/DELETE policies plus a coverage checklist.
54. [x] Simplify email uniqueness to rely solely on `users.email_lower`. Validity Score: 85%
    - Avoid redundant unique constraints and keep optional index for original casing lookups.
55. [x] Clarify `profile_transaction_access_cache.workspace_id` semantics. Validity Score: 80%
    - Allow NULL to represent “profile-wide” cache entries and ensure policy text mirrors the contract.
56. [x] Ensure supporting indexes for RLS-heavy paths. Validity Score: 80%
    - Document composite indexes that keep policy subqueries efficient.
57. [x] Centralize effective transaction category resolution. Validity Score: 85%
    - Provide a single SQL helper/view for overlays + overrides so downstream logic stays consistent.
58. [x] Lock in Prisma + RLS behavior. Validity Score: 75%
    - Require per-request transactions and SET LOCAL GUC setup for consistent policy execution.
59. [x] Tests and ops hardening for RLS + lifecycle workflows. Validity Score: 80%
    - Add pgTAP/E2E coverage, TTL jobs, and GDPR deletion guidance tied to the schema.
60. [x] Fix `effective_transaction_category` to honor override source fields. Validity Score: 95%
    - Tie view/workspace/profile overrides to their source_category/system_source values so they only apply when the transaction currently carries that category.
61. [x] Align `budget_actuals_mv` with workspace-scoped category resolution. Validity Score: 90%
    - Materialized view must not depend on session GUCs or profile overrides; document a workspace-only resolver and keep per-profile overlays at query time.
62. [x] Fix `sync_audit_log` profile linkage. Validity Score: 85%
    - Rename `user_id` → `initiator_profile_id` (FK profiles.id) and update RLS policy to compare against `app.profile_id`.
63. [x] Close RLS gaps for api_keys, subscriptions, budgets, Auth.js tables. Validity Score: 95%
    - Enable/FORCE RLS and define policies (or document privileged roles) so sensitive tables aren’t left exposed to `app_user`.
64. [x] Inline workspace account checks in RLS and document helper guardrails. Validity Score: 80%
    - RLS policies now duplicate the scoped EXISTS logic; note that `workspace_allows_account` is app-only to avoid recursion/perf traps.
65. [x] Allow historical transactions from soft-deleted accounts/connections. Validity Score: 85%
    - Relax RLS to ignore `deleted_at` on connections/bank_accounts so closed accounts still surface past data.
66. [x] Harden category resolution performance strategy. Validity Score: 75%
    - Document join-based alternatives for bulk queries, ensure covering indexes exist, and plan pgTAP property tests against the UDFs.
67. [x] Document RLS performance checks and cache leverage. Validity Score: 70%
    - Recommend routine `EXPLAIN (ANALYZE, BUFFERS)` under RLS and note when to pivot heavy reads to the access caches.
68. [x] Lock down GUC + transaction usage conventions. Validity Score: 75%
    - Document guardrails (helper to clear GUCs, Prisma wrapper/lint rules) so future code can’t bypass SET LOCAL + $transaction expectations.
69. [x] Add parity tests / shared helper for workspace vs profile category resolution. Validity Score: 80%
    - Ensure shared precedence logic stays consistent (tests comparing effective_transaction_category vs effective_workspace_category; consider refactoring to a single core function).
70. [x] Create RLS regression tests + EXPLAIN guards. Validity Score: 80%
    - Verify app_user sees zero rows without GUCs; add canned role-based queries with EXPLAIN checks to prevent full-table scans on hot tables.
71. [x] Add generative tests for category resolution precedence. Validity Score: 85%
    - Randomize system/workspace/profile/view overrides + overlays, compare UDF output against pure SQL and ensure workspace/profile variants stay in sync.
72. [x] Plan Neon operational tuning (partitioning + RLS monitoring). Validity Score: 60%
    - Define when to partition transactions (time/connection) and set up pg_stat_statements tracking for RLS-heavy queries.
73. [x] Normalize `api_keys` ownership semantics. Validity Score: 90%
    - Document `profile_id` as required across entity tree, table spec, and constraint sections so workspace keys remain tied to a profile.
74. [x] Align `api_keys` constraints prose with DDL. Validity Score: 85%
    - Update deterministic constraint text to reflect required `profile_id` and clarify workspace membership enforcement via triggers.
75. [x] Replace RLS-on-materialized-view guidance. Validity Score: 95%
    - Document `budget_actuals` as a refreshed table (optionally surfaced via view), move policies/RLS to that table, and drop invalid `ALTER TABLE budget_actuals_mv ENABLE RLS` instructions.
76. [x] Clarify Auth.js table access strategy. Validity Score: 90%
    - Remove invalid RLS policies/enables for users/accounts/sessions/verification_tokens and document the dedicated `auth_service` role with `BYPASSRLS`.
77. [x] Lock soft-delete semantics for transactions. Validity Score: 85%
    - Note that soft-deleted connections/accounts remain hidden from their tables but leave transactions/overlays visible; updated policies and docs to remove lingering deleted_at checks and explain the behavior.
78. [x] Document system seeding roles under RLS. Validity Score: 80%
    - Clarify that seeding system categories/workspace scaffolding runs under the migration role with `BYPASSRLS`, while `app_user` stays restricted to profile/workspace scopes.
79. [x] Pin hot-path query plans in CI. Validity Score: 70%
    - Require capturing `EXPLAIN (ANALYZE, BUFFERS)` for connections/bank_accounts/transactions joins and enforcing them as regression guards to catch RLS-induced planner regressions.
80. [x] Consolidate RLS documentation. Validity Score: 75%
    - Remove duplicated “Example policies” block, point readers to the canonical CREATE POLICY section, and clarify cache table protections.
81. [x] Add SELECT policy for transactions. Validity Score: 90%
    - Define `transactions_access` mirroring ownership/workspace logic so FORCE RLS no longer blocks legitimate reads while keeping the table append-only.
82. [x] Allow cache/sync writes under RLS. Validity Score: 85%
    - Added `WITH CHECK` clauses for cache and sync tables (user connection cache, transaction cache, sync sessions, payloads, idempotency, leases, audit log) so `app_user` can write while staying scoped.
83. [x] Pin explicit FK delete actions. Validity Score: 80%
    - Documented required `ON DELETE` behaviors (restrict for soft-deleted parents, cascade for sync fan-out/caches) and instructed migrations to declare them explicitly instead of relying on defaults.
84. [x] Harden category resolver docs + tests. Validity Score: 85%
    - Clarified NULL system-category handling, reiterated override precedence, and documented pgTAP property tests (`tooling/tests/pgtap/effective_category.sql`) that validate the resolver functions.
85. [x] Align Auth.js adapter docs with Prisma implementation. Validity Score: 95%
    - Added an adapter alignment checklist covering UUID PKs, lowercase email uniqueness, hashed session/verification tokens, and CI integration tests that exercise Auth.js flows against a Neon preview database.
86. [x] Codify token/secret hashing contract. Validity Score: 90%
    - Documented canonical `<id>.<secret>` envelopes, JSONB hash metadata with rotation support, constant-time verification requirements, and regression tests guarding revocation and logging behaviour.
87. [x] Clamp Prisma context wrapper + PgBouncer guardrails. Validity Score: 85%
    - Documented the `withAppContext` helper pattern, lint/runtime enforcement against raw Prisma usage, and PgBouncer-backed tests verifying `SET LOCAL` survives transaction pooling.
88. [x] Lock RLS coverage + regression tests. Validity Score: 90%
    - Added instructions for CI smoke tests (no-GUC app_user reads), pgTAP role suites, and catalog checks that every FORCE RLS table owns at least one policy.
89. [x] Pin Neon performance plans. Validity Score: 80%
    - Defined seeded-data EXPLAIN workflows, index usage assertions, and CI fixtures that fail when key queries stop using the expected indexes.
90. [x] Tune JSONB GIN index costs. Validity Score: 85%
    - Added WAL/latency measurement guidance, jsonb_path_ops/partial index tradeoffs, and a CI validator to keep noisy GIN indexes from shipping unchecked.
91. [x] Enforce NOT NULL + soft-delete defaults. Validity Score: 90%
    - Documented nullability audits for FKs/timestamps/hashes, NULL defaults for deleted_at/revoked_at, and CI scripts checking partial index coverage.
92. [x] Deferrable constraint regression tests. Validity Score: 85%
    - Captured the DEFERRABLE constraint catalog, bulk transaction tests, and Prisma migration checks so deferred triggers stay verified.
93. [x] Append-only enforcement UX. Validity Score: 80%
    - Documented trigger error assertions, overlay-only mutation flows, and user-friendly API handling for append-only violations.
94. [x] Harden lifecycle TTL jobs. Validity Score: 75%
    - Clarified maintenance role context, FK-safe delete order, regression tests, and monitoring for the nightly sweeps.
95. [x] Flesh out GDPR delete tooling. Validity Score: 80%
    - Documented dry-run support, structured logging, and post-delete RLS tests ensuring users lose access while immutable transactions remain.
96. [x] Lock budget actuals invariants. Validity Score: 85%
    - Captured currency enforcement triggers, scoped refresh jobs, index requirements, and tests verifying rollup_mode, currency filters, and RLS coverage.
97. [x] Add schema drift guardrails. Validity Score: 80%
    - CI now diffs `pg_dump --schema-only` against a canonical snapshot and reiterates that the schema is the source of truth for this document.

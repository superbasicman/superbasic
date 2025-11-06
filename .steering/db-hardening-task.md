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

98. [x] Lock Auth.js table specs (UUID PK + TIMESTAMPTZ timestamps). Validity Score: 90%
    - Added explicit created_at/updated_at requirements plus UUID PK coverage for accounts, sessions, and verification_tokens so adapter migrations stay deterministic.

99. [x] Document ledger sign convention for `amount_cents`. Validity Score: 85%
    - Stated positive=credit/inflow and negative=debit/outflow at the schema top so ingestion, overlays, and reporting all share the same assumption.

100. [x] Define `posted_at` → `budget_actuals.period` conversion. Validity Score: 80%
     - Recorded the exact timezone fallback order and expression (`(posted_at AT TIME ZONE workspace_tz)::date`) budgets must use so refresh jobs and reports never disagree on bucket boundaries.

101. [x] Reaffirm monetary column pairing. Validity Score: 75%
     - Added guidance that every money value ships as `(amount_cents BIGINT, currency VARCHAR(3))` and that migrations introducing new monetary data must add both columns together.

102. [x] Codify soft-delete visibility rules. Validity Score: 85%
     - Declared that archived rows (deleted_at/revoked_at) stay invisible to normal app queries unless an admin/reporting flow opts in via a dedicated role or flag.

103. [x] Patch RLS policies to enforce soft-delete semantics. Validity Score: 90%
     - Updated workspaces, budget_plans/budget_versions/budget_envelopes/budget_actuals, and categories policies to gate on deleted_at (plus budget_envelopes.deleted_at) so members can’t see archived records by default.

104. [x] Align partial UNIQUE indexes with soft-delete filters. Validity Score: 80%
     - Added documentation forbidding active-row unique constraints without the matching `WHERE deleted_at IS NULL` / `revoked_at IS NULL` predicate to prevent conflicts from archived data.

105. [x] Canonicalize category override precedence. Validity Score: 85%
     - Locked the exact resolver order (`transaction_overlays` → `view_category_overrides` → `workspace_category_overrides` → `profile_category_overrides` → `transactions.system_category_id`) and stated all downstream consumers must follow it.

106. [x] Require `system_category_id` on new transactions. Validity Score: 80%
     - Documented ingestion requirements (default to `uncategorized`, reject NULL writes) and noted the temporary legacy debt allowance until cleanup completes.

107. [x] Ban extra category trees. Validity Score: 70%
     - Clarified that only `categories` and `workspace_categories` provide canonical taxonomies; new features must build on these instead of inventing a third tree.

108. [x] Canonicalize the workspace/connection/account access graph. Validity Score: 85%
     - Documented that visibility requires workspace membership plus either `workspace_connection_links` JSON scopes or their projection in `workspace_allowed_accounts`, with `connections.owner_profile_id` anchoring ownership.

109. [x] State that connection owners always retain full visibility. Validity Score: 80%
     - Added guidance that revoking workspace access never hides data from the owning profile and that RLS policies are written with this guarantee.

110. [x] Treat `workspace_allowed_accounts` as a projection only. Validity Score: 75%
     - Clarified that the table is a denormalized mirror of `workspace_connection_links.account_scope_json` maintained by jobs, not an independent source of truth.

111. [x] Reaffirm single-currency budget plans (FX is future work). Validity Score: 85%
     - Documented that v1 budgets must match `workspace.default_currency`, reject mixed-currency inputs, and defer FX support to a later phase.

112. [x] Lock `budget_actuals` as a materialized table refreshed by jobs. Validity Score: 80%
     - Clarified that RLS lives on the table, refreshers run nightly + on writes, and any `budget_actuals_mv` view is just a passthrough alias.

113. [x] Decide partitioning stance for `budget_actuals`. Validity Score: 70%
     - Recorded that v1 ships without partitions (indexes only) while keeping the schema partition-friendly for future workspace/period partitioning work.

114. [x] Lock the Prisma + GUC transaction wrapper as the only user-traffic entrypoint. Validity Score: 90%
      - Declared that every request must run inside the shared `withAppContext` `prisma.$transaction` wrapper that SET LOCALs the context GUCs before issuing queries.

115. [x] Ban direct `prisma.<model>` usage outside the helper. Validity Score: 85%
      - Added guidance plus lint enforcement requirements so raw Prisma client calls cannot bypass the SET LOCAL contract.

116. [x] Define background-job GUC semantics. Validity Score: 80%
      - Documented that jobs either clear all GUCs and run as system flows or deliberately set them when impersonating a profile/workspace (with auditing).

117. [x] Flag heavy ops/tests as Phase 2+ hardening. Validity Score: 75%
       - Annotated the testing/ops checklist (pgTAP RLS matrix, plan validation, TTL/cron jobs, GDPR tooling, deferrable checks) as Phase 2 items so the doc preserves the roadmap without blocking initial delivery.

118. [x] Fix budget_envelopes soft-delete + money contract. Validity Score: 85%
       - Added `deleted_at` to the table spec and documented the `limit_cents` pairing with `budget_plans.currency` so RLS/policies reference existing columns and reviewers know why the currency field is implicit.

119. [x] Enforce revoked/expired filters in workspace access RLS. Validity Score: 90%
      - Updated workspace_connection_links/workspace_allowed_accounts policies (and table prose) to require `revoked_at IS NULL` plus `expires_at > now()` for links, keeping the soft-delete promise intact.

120. [x] Hide soft-deleted saved views + workspace categories in RLS. Validity Score: 85%
       - Added `deleted_at IS NULL` guards to saved_views, workspace_categories, and all view-derived policies (view_filters, view_sorts, etc.) so the documented “soft deletes are invisible” rule matches the SQL.

121. [x] Document soft-delete impact on bank accounts and transactions. Validity Score: 70%
       - Clarified that once connections/bank_accounts are archived, their transactions/overlays disappear from user-facing queries (data persists only for maintenance roles), aligning prose with the current RLS behavior.

122. [x] Denormalize workspace_id into budget_actuals. Validity Score: 80%
        - Added workspace_id to the table schema plus supporting indexes/notes so future partitioning/RLS stay simple without extra joins back to budget_plans.

123. [x] Standardize ZERO_UUID usage. Validity Score: 70%
         - Defined ZERO_UUID once (as `'00000000-0000-0000-0000-000000000000'::uuid`) and updated constraint prose to use the literal so there’s no ambiguity between shorthand and SQL.

124. [x] Clarify zero-amount transaction handling. Validity Score: 65%
          - Noted that provider-supplied zero-cent holds/voids are normalized away (or represented via overlays) so the append-only ledger never stores 0 amounts.

125. [x] Document public view-link access role. Validity Score: 70%
          - Added a note that token-based view consumption runs under a constrained service role outside `app_user`, while management APIs keep relying on profile-scoped RLS.

126. [x] Fix duplicate section numbering. Validity Score: 60%
          - Renumbered the closing “Ready-for-Prod Checklist” section to 14 so the doc stays sequential.

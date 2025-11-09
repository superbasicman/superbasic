# Database Structure — Sync, Audit, and Access Caches

This file covers:

- Sync sessions and related fan-out tables:
  - `sync_sessions`
  - `session_page_payloads`
  - `session_idempotency`
  - `session_leases`
  - `sync_audit_log`
- How sync integrates with the ledger (`transactions`, `connections`, `bank_accounts`)
- Performance/authorization caches:
  - `user_connection_access_cache`
  - `profile_transaction_access_cache`
- Lifecycle and TTL behavior for sync payloads and caches

Use this when you’re working on ingestion/sync pipelines, background workers, or any code that needs to reason about access caches.

For ledger tables:
- See `database-structure-connections-and-ledger.md`.

For workspace access graph and allowed accounts:
- See `database-structure-workspaces-and-views.md`.

For RLS policies and SQL:
- See `database-structure-rls-and-access-control.md` and `database-structure-rls-policies-and-ddl.sql.md`.

---

## 1. Sync Sessions and Audit

Sync runs **per connection** and fans out into several tables. The goal is to:

- Pull data from providers reliably and idempotently.
- Track progress and failure for each sync run.
- Store large provider payloads temporarily (not forever).
- Enforce single-worker processing via leases.
- Maintain an audit trail.

### 1.1 sync_sessions

Table: `sync_sessions`

Purpose:

- Represents a single synchronization run for a connection.

Core columns:

- `id` — UUID PK.
- `connection_id` — FK to `connections(id)` NOT NULL.
- `initiator_profile_id` — FK to `profiles(id)` NOT NULL:
  - Profile that initiated the sync (e.g., user action or system profile).
- `status` — TEXT with CHECK:
  - `CHECK (status IN ('queued','running','success','error'))`
  - Status transitions:
    - `queued → running → success` or `queued → running → error`.
- `started_at` — TIMESTAMPTZ:
  - Time worker started processing the session.
- `ended_at` — TIMESTAMPTZ NULL:
  - Completion time (success or error).
- `stats` — JSONB:
  - Aggregated metrics about the run (e.g. counts of inserted/updated transactions, pages processed).
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Semantics:

- One session per sync run; retried syncs create a new row.
- A session must complete or be marked `error` before a new one for the same connection is scheduled, unless a lease expires (see below).
- Connection-level logic uses `sync_sessions` to:
  - Drive incremental syncs (`connections.tx_cursor`).
  - Debug provider issues via `stats`.

Indexes:

- Recommend index on `(connection_id, started_at DESC)` to support:
  - “Last sync” queries.
  - Paging through historical syncs.

RLS:

- Visibility is limited to:
  - The connection owner, and
  - Members of workspaces that have access to the connection (see access graph).
- See `sync_sessions_access` policy in the RLS SQL file.

---

### 1.2 session_page_payloads

Table: `session_page_payloads`

Purpose:

- Store per-page provider payloads for a given sync session.
- Designed for large, transient blobs that are useful for debugging but should not live forever.

Core columns:

- `id` — UUID PK.
- `sync_session_id` — FK to `sync_sessions(id)` NOT NULL.
- `page_no` — INT NOT NULL:
  - Page index within the sync session (0-based or 1-based; app-defined but must be consistent).
- `payload` — JSONB NOT NULL:
  - Provider response payload for that page.
- `expires_at` — TIMESTAMPTZ NOT NULL:
  - Time after which the payload can be safely deleted.
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Indexes:

- Partial index on `(expires_at)`:
  - Efficient TTL sweeps:
    - Delete rows where `expires_at <= now()`.

Lifecycle:

- TTL job:
  - Periodically deletes expired payload rows (and associated blobs, if stored elsewhere).
  - This keeps the table from growing unbounded.
- Payload retention window:
  - Typically 30–90 days (configurable at the job level).

RLS:

- Mirrors `sync_sessions` visibility:
  - Must ensure only authorized profiles see payloads tied to connections they can access.

---

### 1.3 session_idempotency

Table: `session_idempotency`

Purpose:

- Ensure idempotent processing of actions within a sync session (e.g., page-level or command-level idempotency keys).

Core columns:

- `id` — UUID PK.
- `sync_session_id` — FK to `sync_sessions(id)` NOT NULL.
- `idempotency_key` — TEXT NOT NULL UNIQUE:
  - Key representing a particular idempotent operation (e.g., `sync-page-<page_no>`).
- `status` — TEXT NOT NULL:
  - Status of the idempotent operation.
  - Allowed values are defined at the application layer (e.g. `'pending'`, `'completed'`, `'failed'`).
- `result_ref` — TEXT NULL:
  - Optional reference to stored results or another table for the outcome.
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Semantics:

- On processing an idempotent operation:
  - Worker first checks for an existing `idempotency_key`.
  - If present and completed, it reuses the recorded outcome.
  - If not, it creates a new row and updates status once the operation finishes.
- This table is crucial for:
  - Safe retries.
  - Protecting against duplicate provider callbacks or at-least-once tasks.

RLS:

- Access is scoped via `sync_sessions` and their underlying `connections`.
- See `session_idempotency_access` policy.

---

### 1.4 session_leases

Table: `session_leases`

Purpose:

- Enforce single-worker processing for each sync_session.
- Allow safe takeover if a worker dies or hangs.

Core columns:

- `id` — UUID PK.
- `sync_session_id` — FK to `sync_sessions(id)` NOT NULL.
- `leased_until` — TIMESTAMPTZ NOT NULL:
  - Time until which the current holder owns the lease.
- `holder` — TEXT NOT NULL:
  - Identifier for the worker/process (e.g. hostname or worker ID).
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Semantics:

- Worker behavior:
  - Claims a lease by inserting or updating a row with:
    - `leased_until = now() + lease_duration`
    - `holder = <worker-id>`
  - Periodically extends the lease while making progress.
- Takeover:
  - If `leased_until` has passed without completion:
    - New worker may claim the lease.
    - Prior work is considered abandoned.
    - The existing `sync_sessions.status` should transition accordingly (e.g. to `'error'` or a retried state).
- Recovering stuck sessions:
  - If a session’s lease expires and status is not `success` or `error`:
    - Mark the session as `'error'` (or schedule a new session for retry).
    - New session runs with a fresh lease.

RLS:

- Restricted to maintenance roles and backend services.
- User-facing traffic typically does not interact with this table directly.
- See `session_leases_access` policy.

---

### 1.5 sync_audit_log

Table: `sync_audit_log`

Purpose:

- Append-only audit log for sync operations across connections and sessions.

Core columns:

- `id` — UUID PK.
- `connection_id` — FK to `connections(id)` NOT NULL.
- `sync_session_id` — FK to `sync_sessions(id)` NULL:
  - Optional; some events may not be tied to a specific session.
- `initiator_profile_id` — FK to `profiles(id)` NULL:
  - Profile that initiated the event when user-driven.
  - NULL for system or worker events.
- `event` — TEXT NOT NULL:
  - Event type (e.g. `"sync_started"`, `"sync_completed"`, `"sync_failed"`, `"cursor_updated"`).
- `meta` — JSONB NOT NULL:
  - Structured metadata (error codes, counts, provider messages, context).
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.

Semantics:

- Provides a durable audit trail for:
  - Sync results.
  - Manual admin operations.
  - Incident and debugging traces.
- `initiator_profile_id`:
  - Set when a user explicitly triggers sync.
  - NULL when the event is system/cron/worker initiated.

RLS:

- Visibility is restricted to:
  - Connection owners.
  - Workspace members for connections they can access.
- See `sync_audit_log_access` policy.

---

## 2. Integration with the Ledger

Sync interacts with the ledger (see `database-structure-connections-and-ledger.md`):

- Each `sync_session` belongs to a `connection`.
- During a session:
  - Provider pages are stored in `session_page_payloads`.
  - New `transactions` are inserted (append-only).
  - `connections.tx_cursor` is updated for incremental syncs.
  - `transaction_audit_log` rows are written for key events.

Flows:

1. A sync is queued for `connection_id`.
2. Worker claims a lease via `session_leases`.
3. Worker updates `sync_sessions.status` to `'running'`.
4. For each provider page:
   - Insert a row into `session_page_payloads` (with a TTL).
   - Insert/update relevant ledger rows (append-only for `transactions`).
   - Log events in `transaction_audit_log` and `sync_audit_log`.
5. On success:
   - Update `sync_sessions.status` to `'success'`.
   - Set `ended_at`.
6. On error:
   - Update `sync_sessions.status` to `'error'`.
   - Log error details in `sync_audit_log`.
   - Release or expire the lease so future workers can retry.

Visibility:

- As soon as transactions are written:
  - They surface to:
    - The connection owner, and
    - Any workspaces with active `workspace_connection_links` or `workspace_allowed_accounts` for the affected accounts.
- RLS ensures:
  - Only authorized profiles see those transactions.

---

## 3. Performance / Authorization Caches

Two optional caches accelerate repeated access checks and hot-path queries:

- `user_connection_access_cache`
- `profile_transaction_access_cache`

They are **derived** from deterministic queries and can be safely truncated when invalidated.

### 3.1 user_connection_access_cache

Table: `user_connection_access_cache`

Purpose:

- Cache per-profile/per-connection/per-workspace access decisions and visible account scopes.
- Reduce cost of repeatedly recomputing workspace/connection/account predicates.

Core columns:

- `profile_id` — UUID NOT NULL:
  - Profile making the request.
- `connection_id` — UUID NOT NULL:
  - Connection for which access is cached.
- `workspace_id` — UUID NULL:
  - Workspace context:
    - NULL → cache entry across all workspaces (profile-only context).
    - Non-NULL → cache entry specific to a workspace.
- `account_scope_json` — JSONB:
  - Cached account scope:
    - Could mirror `workspace_connection_links.account_scope_json` or a computed intersection.
- `user_id` — UUID NULL:
  - Optional `users.id` for audit/debug only.
  - All actual access control keys off `profile_id` and `workspace_id`.
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Indexes and uniqueness:

- GIN index on `account_scope_json` (where beneficial).
- Uniqueness constraint:

  - `UNIQUE (
       profile_id,
       connection_id,
       COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid)
     )`

  - Uses ZERO_UUID shorthand for NULL workspace_id to enforce a single cache row per (profile, connection, workspace-scope).

Semantics:

- These entries are computed by backend services, not by user traffic directly.
- They are “just a cache”:
  - If truncated, the system recomputes them on demand.
- They must always reflect the same semantics as the underlying RLS and access graph.

RLS:

- Protected via FORCE RLS.
- Policy (`user_connection_cache_policy`) ensures:
  - A profile sees only cache entries where:
    - `profile_id = current_setting('app.profile_id')`, and
    - `workspace_id IS NULL` or matches `app.workspace_id`.

---

### 3.2 profile_transaction_access_cache

Table: `profile_transaction_access_cache`

Purpose:

- Cache per-transaction access decisions for a profile (and optionally a workspace).
- Used for high-volume transaction feeds and analytics where RLS access checks would otherwise be expensive per row.

Core columns:

- `transaction_id` — UUID NOT NULL.
- `profile_id` — UUID NOT NULL.
- `workspace_id` — UUID NULL:
  - NULL → profile-wide (all-workspace) access.
  - Non-NULL → workspace-specific access.
- `connection_id` — UUID NOT NULL.
- `account_id` — UUID NOT NULL.
- `created_at` — TIMESTAMPTZ NOT NULL DEFAULT `now()`.
- `updated_at` — TIMESTAMPTZ NOT NULL.

Uniqueness:

- `UNIQUE (
     transaction_id,
     profile_id,
     COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid)
   )`

  - ZERO_UUID is used again as a sentinel for NULL workspace_id.

Semantics:

- Each row asserts:
  - “This profile has access to this transaction, optionally in this workspace context.”
- Derived from:
  - Workspace membership.
  - Workspace connection links and allowed accounts.
  - Connection ownership rules.
- When underlying access graph changes (membership, links, revocations):
  - Cache entries must be invalidated and recomputed.

RLS:

- Mirrors transaction visibility:
  - A profile can only see rows where:
    - `profile_id = current_setting('app.profile_id')`.
    - `workspace_id` is NULL or equals `current_setting('app.workspace_id')`.
- See `profile_transaction_cache_policy`.

---

### 3.3 Cache lifecycle and invalidation

Both caches share these properties:

- Derived from deterministic queries:
  - Safe to truncate entirely if necessary (e.g., maintenance or migration).
- Invalidation events:
  - Changes to:
    - workspace_members,
    - workspace_connection_links,
    - workspace_allowed_accounts,
    - connections.status / deleted_at,
    - bank_accounts.deleted_at,
    - relevant RLS policies.
  - This should trigger:
    - Cache invalidation for affected profiles/connections/workspaces, or
    - A global refresh for more invasive changes.
- RLS:
  - FORCE RLS is enabled to ensure:
    - Application only sees rows allowed by the same predicates as the primary tables.
    - Even caches cannot be used to bypass access control.

---

## 4. Lifecycle Jobs (Sync and Caches)

Lifecycle jobs are described more fully in the operational hardening file, but the sync/caches aspects are:

- TTL sweeps:
  - `session_page_payloads`:
    - Delete rows where `expires_at <= now()`.
  - `sessions`, `verification_tokens`, `view_links`, `workspace_connection_links`:
    - Similar TTL logic on `expires_at` and/or revoked/expired markers.
- Denormalization:
  - Nightly or frequent jobs update:
    - `workspace_allowed_accounts` from `workspace_connection_links.account_scope_json`.
- Cache management:
  - Jobs may periodically:
    - Truncate or prune `user_connection_access_cache` and `profile_transaction_access_cache`.
    - Rebuild caches for hot profiles/workspaces.
- Roles:
  - These jobs run under a dedicated `maintenance_user` role (or similar) that:
    - Sets GUCs (`app.profile_id`, `app.workspace_id`) to NULL.
    - Has the necessary privileges to delete rows and bypass RLS only where explicitly documented.
- Ordering and transactions:
  - Cleanup scripts must obey FK order:
    - For example, purge child payload rows (`session_page_payloads`, session-related blobs) before deleting parent `sync_sessions`.

Observability:

- Each TTL and cache job should emit:
  - Structured logs (rows deleted, duration).
  - Metrics for alerting when:
    - Jobs fail.
    - They delete zero rows over multiple runs (possible scheduling issues or RLS misconfiguration).

---

## 5. Summary of Responsibilities

- `sync_sessions`:
  - High-level unit of sync per connection (status, timing, stats).
- `session_page_payloads`:
  - Temporary storage of provider payload pages with TTL.
- `session_idempotency`:
  - Per-session idempotency keys to guard against duplicate processing.
- `session_leases`:
  - Single-worker processing and takeover for stuck sessions.
- `sync_audit_log`:
  - Durable log of sync events across connections/sessions.

- `user_connection_access_cache`:
  - Cache of per-profile/per-connection/per-workspace access and scope.
- `profile_transaction_access_cache`:
  - Cache of per-transaction access for profiles, optionally per workspace.

All of these structures are subordinate to:

- The canonical ledger (`connections`, `bank_accounts`, `transactions`).
- The workspace access graph (`workspace_connection_links`, `workspace_allowed_accounts`, `workspace_members`).
- RLS policies based on GUCs (`app.user_id`, `app.profile_id`, `app.workspace_id`).

When changing sync or cache behavior, always:

1. Consider impacts on RLS and access control.  
2. Update this file and the RLS/constraints docs to reflect any new semantics.  
3. Ensure TTL and maintenance jobs are still valid and safe under FORCE RLS.  

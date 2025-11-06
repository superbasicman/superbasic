# Background Workflows & Sync

## Background Workflows

- Use Upstash QStash for long-running Plaid syncs or other long-running jobs.
- Chunk work so each handler finishes well under the Vercel (or hosting) free tier timeout.
- Persist sync cursors and statuses in `sync_sessions`; re-queue jobs defensively on failure.
- Batch manual “Sync Now” requests and rely on frontend polling; never block a request on the entire sync finishing.
- Prefer idempotent handlers and explicit retry policies for background work.

# Slim-Down Best Practices

Guidelines to keep work focused, production-ready, and simple while we reshape the repo.

## Planning & Coordination

- Write down scope and acceptance criteria before coding; keep README plans updated.
- Work in feature-aligned branches and open smaller PRs instead of giant dumps.
- Flag risky changes early (auth, billing, migrations) so we can plan rollbacks.

## Code Organization

- Keep domain logic in `packages/core` and surface it via pure functions; apps consume only those APIs.
- Restrict `apps/web` to SDK/API calls—lint or CI should fail on direct DB imports.
- Favor composable Hono middlewares for CORS, rate limits, and auth; avoid bespoke wrappers unless necessary.
- Centralize secrets in `apps/api` env parsing; never load them in `apps/web`.

## Code Quality

- Write DRY, modular code—extract repeated logic into small, focused functions.
- Keep functions ideally under 50 lines roughly; break down complex logic into composable pieces.
- Prefer readable code over clever code; clear naming beats comments but still add comments.
- Extract magic numbers and strings into named constants.
- Avoid deeply nested conditionals; use early returns and guard clauses.
- Use async/await for asynchronous code; avoid callback hell and deeply nested promises.

## Security & Compliance

- Hash all personal access tokens and store only the digest; surface plaintext once on creation.
- Enforce `Authorization: Bearer` for every `/v1` route; intentionally whitelist any public route.
- Implement Postgres row-level security for multi-tenant tables using session variables and Prisma transactions.
- Log sensitive actions (key create/revoke, billing updates, Plaid sync failures) to the audit trail with request IDs.

## API Contracts

- Use Zod schemas for every handler input/output; derive types and OpenAPI spec from them.
- Snapshot OpenAPI output in CI and review diffs on PRs.
- Version routes under `/v1`; only non-breaking additions allowed within the version.

## Database & Migrations

- Model finance data as append-only ledger entries; never delete or mutate historical rows.
- Keep Prisma migrations in version control and run them locally before pushing.
- Backfill data with migration scripts or explicit tasks; avoid manual edits.
- Set `pg_set_config` variables for user/workspace IDs at the start of each request to satisfy RLS.

## Background Workflows

- Use Upstash QStash for long-running Plaid syncs; chunk work so each handler finishes under the Vercel timeout.
- Persist sync cursors and statuses in `sync_sessions`; re-queue jobs defensively on failure.
- Batch manual "Sync Now" requests and rely on frontend polling; never block a request on the whole sync.

## Testing & Verification

- Default check: `pnpm run lint`, `pnpm run test`, `pnpm run build` before commit.
- Add unit tests alongside new core logic and integration tests for new `/v1` routes.
- Run end-to-end smoke tests (login, key creation, checkout, Plaid link) before releases.
- Verify OpenAPI diff is clean and SDK build completes in CI.

## Observability & Monitoring

- Attach a `requestId` to every API request; include it in logs and audit entries.
- Standardize error responses with codes and messages; avoid leaking internal stack traces.
- Ensure Sentry captures edge and node environments; Pino logs should include structured metadata.

## Operational Hygiene

- Document deploy steps in `tooling/ci` and keep them reproducible.
- Store runbooks for Stripe/Plaid webhook rotation, key revocation, and incident response.
- Keep `.env.example` updated with only the vars needed by each app.
- When removing packages/apps, archive them first so we can resurrect if needed.

## Culture & Collaboration

- Keep comments concise; prefer clear naming over verbose explanations.
- Raise questions when requirements conflict with security/production readiness; don't assume intent.
- Celebrate simplifications—deleting unused code is a win.

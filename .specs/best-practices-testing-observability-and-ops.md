# Testing, Observability & Operational Hygiene

## Testing Strategy by Layer

**Unit Tests (`packages/core`):**

- Test services with mocked repositories.
- Test repositories with a test database.
- Test utilities as pure functions.
- No HTTP mocking needed.

**Integration Tests (`apps/api`):**

- Test route handlers with real services.
- Test full request/response cycle (happy + failure paths).
- Test middleware integration (auth, rate limits, validation).
- Use a test database.

**E2E Tests (`apps/web`):**

- Test user flows through the UI.
- Test against a running API instance.
- Test OAuth/auth flows end-to-end.

## Testing & Verification (Release Checklist)

- Default pre-commit / pre-push check: run `pnpm run lint`, `pnpm run test`, and `pnpm run build`.
- Add unit tests alongside new core logic and integration tests for new `/v1` routes.
- Run end-to-end smoke tests (login, key creation, checkout, Plaid link) before releases.
- Verify OpenAPI diff is expected and that SDK build completes in CI.
- Ensure migrations have been applied in non-prod environments before promoting to prod.

## Observability & Monitoring

- Attach a `requestId` to every API request; include it in logs and audit entries.
- Standardize error responses with codes and messages; avoid leaking internal stack traces.
- Ensure Sentry (or equivalent) captures both edge and node environments.
- Ensure structured logs (e.g. Pino) include relevant metadata (requestId, user/profile/workspace IDs, route, etc.).
- For incidents, logs + traces should be enough to reconstruct:  
  *what happened, to whom, and when.*

## Operational Hygiene

- Document deploy steps in `tooling/ci` and keep them reproducible.
- Store runbooks for Stripe/Plaid webhook rotation, key revocation, and incident response.
- Keep `.env.example` updated with only the vars needed by each app.
- When removing packages/apps, archive them first so we can resurrect them if needed.
- Prefer explicit scripts (`package.json` or `tooling/`) over ad-hoc shell one-liners for operational tasks.

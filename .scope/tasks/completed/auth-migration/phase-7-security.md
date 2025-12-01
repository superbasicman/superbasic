# Phase 7 – Security Hardening (Cookies, CSRF, Rate Limits, Audit, Keys)

Context to review:
- `docs/auth-migration/auth-migrate-phases.md` (Phase 7 scope)
- `agent/steering/api-contracts.md`, `database-structure-rls-and-access-control.md`, `database-structure-constraints-indexes-and-triggers.md`
- Existing middleware: `apps/api/src/middleware/cors.ts`, `apps/api/src/middleware/rate-limit/*`

- [x] 1. Cookie & CORS strategy
  - Decide/implement where refresh tokens live (HttpOnly cookie vs. bearer).
  - Configure cookie flags: `HttpOnly`, `Secure`, `SameSite`, `Domain`, `Path`.
  - Align CORS: allowed origins, `Access-Control-Allow-Credentials`, allowed headers.
  - Sanity check: browser login/refresh works with configured cookies; CORS preflight passes for app origin(s).

- [x] 2. CSRF protection for cookie-backed flows
  - Add CSRF guard to endpoints using cookies (e.g., `/v1/auth/refresh`, `/v1/auth/logout`).
  - Double-submit cookie or custom non-simple header; document expected client behavior.
  - Sanity check: requests without CSRF token/header are blocked; happy-path passes.

- [x] 3. Rate limiting for auth-sensitive endpoints
  - Per-IP and/or per-user limits on `/v1/auth/token`, `/v1/auth/refresh`, `/v1/oauth/token`, `/v1/tokens` creation, login/signup.
  - Reuse `apps/api/src/middleware/rate-limit/*` or extend infra; add tests.
  - Sanity check: burst beyond threshold returns 429 with proper headers; normal flow unaffected.

- [x] 4. Logging & auditing
  - Emit structured events for login success/failure, token creation/rotation, refresh reuse detection, session revocation, PAT create/update/delete, account status changes.
  - Ensure no sensitive secrets (full tokens) are logged; consider IP/UA truncation.
  - Sanity check: logs appear in local/structured logger with redaction.

- [x] 5. Key management & rotation
  - Verify signing keys are KMS-backed/configurable; document rotation cadence and emergency steps.
  - Ensure JWKS update/retention behavior is defined; add tests if applicable.
  - Sanity check: rotated key still validates tokens; JWKS exposes active keys only.

- [x] 6. RLS refinement
  - Expand/verify RLS on sensitive tables, especially workspace-scoped data.
  - Validate `app.workspace_id` is applied consistently.
  - Sanity check: unauthorized cross-workspace access blocked via tests or manual queries.

- [x] 7. Docs & final validation
  - Update auth docs with cookie/CSRF/rate-limit behavior and rotation notes.
  - Run: `pnpm --filter @repo/api typecheck && pnpm --filter @repo/auth-core build` and relevant auth e2e/regression suites.

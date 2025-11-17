# Phase 3 – Refresh Tokens & Session Lifecycle

Context to review before starting:
- `docs/auth-migration/auth-migrate-phases.md` (Phase 3 scope)
- `docs/auth-migration/end-auth-goal.md` (target auth UX)
- `agent/agents.md` for checklist and delivery guardrails

- [x] 1. Extend the database + auth-core token models to support refresh tokens with uniqueness & hashing  
  - Sanity check: add migrations so `tokens` enforces `(familyId, revokedAt IS NULL)` uniqueness, exposes `type = 'refresh'`, and stores hashed secrets; run `pnpm --filter @repo/database exec dotenv -e .env.local -- prisma migrate deploy && pnpm --filter @repo/database exec prisma validate`.

- [x] 2. Implement refresh-token creation utilities (`TokenService`, helpers in `@repo/auth-core`) that mint opaque secrets, hash/envelope them, and persist `Token` rows linked to sessions  
  - Sanity check: `pnpm --filter @repo/auth-core exec vitest run` covers happy-path issuance plus hashing/TTL edge cases.

- [x] 3. Build `/v1/auth/token` to convert the IdP/Auth.js handoff into `VerifiedIdentity`, enforce user/identity linking rules, create `Session`, and respond with `{ accessToken, refreshToken, expiresIn }`  
  - Sanity check: `pnpm --filter @repo/api exec dotenv -e .env.local -- vitest run --runInBand` (or `--run` if needed) exercises login → issue flow, removes the legacy Auth.js cookie requirement from `/v1/auth/session`, and ensures auth middleware consumes `Authorization: Bearer`.

- [ ] 4. Replace cookie-based auth middleware usage with JWT-based context  
  - Sanity check: update Hono routes (tokens, me, etc.) to rely on `attachAuthContext`/`@repo/auth-core` instead of `authjs.session-token`, delete any direct Prisma session lookups from middleware, and rerun `pnpm --filter @repo/api exec vitest run --runInBand` so protected endpoints pass when only `Authorization: Bearer` is provided.

- [ ] 5. Update SPA + mobile auth flows to consume the new token endpoints  
  - Sanity check: run the web app (and mobile client if applicable) against local API so that login → `POST /v1/auth/token` works, access tokens are attached to API calls, refresh rotation via `POST /v1/auth/refresh` happens automatically on expiry/401, and `/v1/auth/logout` clears local tokens and invalidates the session server-side.

- [ ] 6. Build `/v1/auth/refresh` with rotation + sliding session window and integrity checks  
  - Sanity check: API tests cover: valid refresh returns new pair, expired/ revoked tokens return `401 invalid_grant`, session expiry blocks refresh, and `lastUsedAt`/`expiresAt` update in the DB.

- [ ] 7. Implement reuse detection + logout and session management endpoints  
  - Sanity check: tests demonstrate reuse revokes the entire family & session, `/v1/auth/logout` tears down current session + cookies, `/v1/auth/sessions` lists active sessions, and `DELETE /v1/auth/sessions/:id` revokes targeted sessions with corresponding refresh tokens.

- [ ] 8. Docs/testing sweep  
  - Sanity check: update `docs/auth-migration/auth-migrate-phases.md` (Phase 3 exit criteria + risks), run `pnpm lint`, `pnpm typecheck`, and `pnpm test -- --run` to confirm the monorepo is green with the new auth flow.

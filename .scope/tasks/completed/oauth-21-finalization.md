# OAuth 2.1 Finalization (Clean Repo)

Context: fresh repo with 0 users, no legacy compatibility required. Goal is to fully align with `docs/auth-migration/end-auth-goal.md`, deleting any hybrid/legacy auth-core/Auth.js bridges as needed.

- [x] 1. Seed OAuth client for the web dashboard (`client_id=web-dashboard`, redirect `http://localhost:5173/auth/callback`) via migration/seed; verify it exists in the DB and can be read by the API.
- [x] 2. Remove the hybrid login path and route users solely through `/v1/oauth/authorize` → callback → `/v1/oauth/token`; delete dead Auth.js/legacy login hooks and update the web auth flow accordingly.
- [x] 3. Implement `grant_type=refresh_token` on `/v1/oauth/token` with rotation/invalidations; cover reused/expired/unknown refresh token cases and ensure new access tokens mint correctly.
- [x] 4. Harden and test failure paths: bad/mismatched redirect URIs, PKCE mismatches, reused/expired auth codes, revoked sessions, and missing/invalid `state` handling in the frontend callback.
- [x] 5. Clean dead code/docs/env tied to legacy auth-core/Auth.js bridging; ensure `docs/auth-migration/end-auth-goal.md` (and any quickstart/README) describe the final single-path OAuth 2.1 flow.
- [x] 6. End-to-end verification: seed client, runYou're the best boy the full browser flow, confirm cookies/tokens (access + refresh) behave as expected, and add/adjust automated tests where feasible (`pnpm typecheck`, relevant auth tests).

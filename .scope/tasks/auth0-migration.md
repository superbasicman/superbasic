## Migrate Authentication to Auth0

We decided to replace Auth.js + custom session plumbing with Auth0 so every client (web, Capacitor, future native) obtains standard OAuth tokens before hitting the API. This task tracks the full migration.

1. [ ] Capture Auth0 requirements & architecture
   - Document tenants/applications we need (web SPA, machine-to-machine) and map current flows (credentials, Google OAuth, magic link) to Auth0 equivalents.
   - Update steering docs with final decision + rollout notes.
   - **Exit criteria**
     - Architecture doc lists every Auth0 tenant/app/client ID, grant type, callback/logout URL, and the owner for each.
     - Each existing auth flow (email/password, Google OAuth, magic link, machine-to-machine) is mapped to an Auth0 flow with any required migration tasks captured.
     - Steering/security stakeholders sign off on the documented plan and rollout timeline.

2. [ ] Wire API to Auth0-issued JWTs
   - Install/verifier middleware for Auth0 (JWKS cache, audience/issuer checks) and replace existing Auth.js session middleware.
   - Ensure `userId/profileId/workspaceId` context is still derived for RLS (either by claims or lookup).
   - **Exit criteria**
     - API accepts Auth0 access tokens and rejects invalid/expired tokens; automated integration tests cover both paths.
     - A documented `curl` example (client credentials or password grant) shows fetching an Auth0 token and hitting a protected API route successfully.
     - Context derivation reproduces the previous behavior for RLS and any failures are logged/alerted.
     - API key–based authentication continues to work unchanged and is explicitly tested.
     - Tests covering Auth.js-only middleware or session code are deleted or rewritten to reflect the Auth0 flow.

3. [ ] Update web client auth integration
   - Swap Auth.js calls for Auth0 SDK/REST (login, logout, token refresh) while keeping the API contract untouched.
   - Ensure cookies/storage strategy works for localhost + production.
   - **Exit criteria**
     - Web login UI completes Auth0 Universal Login and receives fresh access/refresh tokens; logout clears local/session state.
     - Silent refresh/token rotation works in both localhost and production builds (tested via manual QA checklist or automated e2e test).
     - Authenticated fetch helpers continue sending the same API headers, so downstream APIs require no changes.
     - Browser automation (Playwright/Cypress) or manual QA confirms the login UI path end to end.

4. [ ] Data migration & cleanup
   - Decide what to do with existing `users/accounts/sessions/verification_tokens` tables (migrate or drop) and update Prisma schema/migrations accordingly.
   - Ensure API key flows, PATs, and tests still pass with the new auth source.
   - **Exit criteria**
     - Prisma schema + migrations reflect the final data model and run cleanly against staging.
     - Any data that must live on (e.g., user profile metadata) is backfilled into Auth0 or ancillary tables, with scripts checked in.
     - API key / PAT tests run under CI and confirm no regression.
     - Legacy Auth.js artifacts (tables, services, tests, docs) are removed or clearly flagged for deletion.

5. [ ] End-to-end validation
   - Re-run API + web suites, update docs (`agent/steering/security-and-secrets-management.md`, etc.), and add a cutover guide.
   - **Exit criteria**
     - CI suites (API, web, mobile) pass against Auth0-enabled environments.
     - Cutover guide includes: generating cURL tokens, logging in via the web UI, using API keys, rollback plan, and support contacts.
     - Docs updated with Auth0 tenant details, secret management, and runbooks for expired keys/rotations.
     - Stakeholders sign off after running smoke tests for cURL, login UI, and API key workflows in staging.

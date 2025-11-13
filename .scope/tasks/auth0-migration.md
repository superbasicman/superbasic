## Migrate Authentication to Auth0

We decided to replace Auth.js + custom session plumbing with Auth0 so every client (web, Capacitor, future native) obtains standard OAuth tokens before hitting the API. This task tracks the full migration.

1. [ ] Capture Auth0 requirements & architecture
   - Document tenants/applications we need (web SPA, machine-to-machine) and map current flows (credentials, Google OAuth, magic link) to Auth0 equivalents.
   - Update `decide-auth.md`/other steering docs with final decision + rollout notes.

2. [ ] Wire API to Auth0-issued JWTs
   - Install/verifier middleware for Auth0 (JWKS cache, audience/issuer checks) and replace existing Auth.js session middleware.
   - Ensure `userId/profileId/workspaceId` context is still derived for RLS (either by claims or lookup).

3. [ ] Update web client auth integration
   - Swap Auth.js calls for Auth0 SDK/REST (login, logout, token refresh) while keeping the API contract untouched.
   - Ensure cookies/storage strategy works for localhost + production.

4. [ ] Data migration & cleanup
   - Decide what to do with existing `users/accounts/sessions/verification_tokens` tables (migrate or drop) and update Prisma schema/migrations accordingly.
   - Ensure API key flows, PATs, and tests still pass with the new auth source.

5. [ ] End-to-end validation
   - Re-run API + web suites, update docs (`agent/steering/security-and-secrets-management.md`, etc.), and add a cutover guide.

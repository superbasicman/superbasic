# Auth Single Path (Auth.js as Identity Only)

Goal: remove the dual session model. Auth.js handles identity (credentials, Google, magic link); auth-core owns sessions, access/refresh tokens, and CSRF.

- [ ] 1. Remove `/v1/auth/login` as an entry point (keep refresh/logout/PAT only) and update docs/tests accordingly.  
  - Sanity check: `rg "/v1/auth/login"` shows only historical references; API route/middleware removed or clearly deprecated in docs.
- [ ] 2. Strip Auth.js session persistence and CSRF: no `authjs.session-token`/`authjs.csrf-token` cookies, no Prisma session CRUD from the Auth.js adapter, no JWT encode/decode that reads/writes Auth.js sessions.  
  - Sanity check: Auth.js signin/callback responses set no Auth.js cookies; Prisma `sessions` only written by auth-core flows.
- [ ] 3. Rework `apps/api/src/auth.ts` callbacks to mint auth-core session + refresh + access tokens, set only `sb.refresh-*` cookies/headers, and clear any legacy Auth.js cookies if present.  
  - Sanity check: callback response includes `sb.refresh-token` + `sb.refresh-csrf` cookies and `X-Access-Token`; no `authjs.session-token`; `/v1/auth/refresh` succeeds.
- [ ] 4. Standardize CSRF on refresh double-submit only; remove Auth.js `/csrf` reliance in code/docs.  
  - Sanity check: docs/tests no longer reference Auth.js CSRF; refresh endpoint enforces double-submit and passes tests.
- [ ] 5. Align rate limits to the single entry path: keep credentials/magic-link limits on Auth.js endpoints; drop `/v1/auth/login` rate limits.  
  - Sanity check: rate-limit middleware only wraps Auth.js signin/callback routes; auth rate-limit tests updated/passing.
- [ ] 6. Update auth middleware + docs to reflect the single model (Bearer access tokens only; Auth.js cookies alone don’t auth API).  
  - Sanity check: `current-auth-implementation.md` (and related) describe the new flow; tests referencing Auth.js session cookies are removed or updated.
- [ ] 7. Ensure provider flows (credentials, Google, magic link) emit identity metadata and audit events through one code path when creating auth-core sessions.  
  - Sanity check: integration tests for each provider assert session + refresh creation via auth-core and audit events emitted.
- [ ] 8. Clean dead code/config/env vars tied to the old bridge or Auth.js sessions.  
  - Sanity check: `rg "authjs.session-token"` and `rg "maybeIssueAuthCoreSession"` return no active code paths; lint/tests (`pnpm lint`, targeted auth tests) pass.

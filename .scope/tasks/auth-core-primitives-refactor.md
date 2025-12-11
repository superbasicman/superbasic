# Auth-core consolidation – move higher-order auth utilities into auth-core

Context: per agents.md, new repo (no legacy), auth-core is the source of truth. Higher-order auth logic currently lives in `packages/auth` (primitives package). Goal: move service-level pieces into `packages/auth-core` to keep primitives lean and avoid duplicated logic. There are no users and this is a new repo, so no legacy compatibility needed. Remove any dead code or docs you encounter along the way.

- [x] 1. Reconfirm scope and call sites for higher-order helpers in `packages/auth`.  
  - Sanity check: short list of files/functions to move (profile/email/events/pat/session-transfer/rbac) plus their consumers.  
  - Findings:  
    - `profile.ts/ensureProfileExists` wraps `auth-core` service; no consumers outside tests/wrapper.  
    - Email senders (`email.ts` sendMagicLinkEmail/sendVerificationEmail) used in API routes `apps/api/src/routes/v1/auth/magic-link.ts`, `register.ts`, `resend-verification.ts`; verification service handles tokens but calls are in routes.  
    - Auth event emitter (`events.ts`) consumed across API and core: API services/index wiring, audit logger, rate-limit tracking, auth refresh/logout/token routes/tests; core token-service, user-service, verification-service emit events.  
    - PAT helpers (`pat.ts` + `token-hash.ts`) used by core token-service (generate/hash/parse), API OAuth/token flows, PAT middleware/tests, opaque token utilities.  
    - Session transfer helpers (`session-transfer.ts`) used in `apps/api/src/routes/v1/auth/signin.ts` (mobile flow) and `apps/api/src/routes/v1/oauth/authorize.ts`.  
    - RBAC helpers (`rbac.ts`) mostly in package tests; scopes enforcement elsewhere relies on auth-core/authz; could be moved or left as primitives.

- [x] 2. Move profile provisioning (`ensureProfileExists`) into auth-core service layer.  
  - Sanity check: `packages/auth-core` exports the helper; imports in API/core updated; tests pass for user/profile creation.  
  - Done: removed wrapper from `packages/auth` (deleted `profile.ts` and its tests; dropped export from `packages/auth/src/index.ts`). Auth-core already provides `ensureProfileExists` via `AuthCoreService`; no remaining callers of the wrapper.

- [x] 3. Move email senders (magic link, verification) into auth-core and re-export there.  
  - Sanity check: `auth-core` owns email orchestration; API routes still send emails successfully in tests/mocks; `packages/auth` no longer exports email senders.  
  - Done: Added `packages/auth-core/src/email.ts` (+ tests) and exported via `@repo/auth-core`; updated API routes (`auth/magic-link.ts`, `register.ts`, `auth/resend-verification.ts`) to import from auth-core; removed email utilities and tests from `@repo/auth`; added path mapping to email-templates dist for types; `@repo/auth-core` typecheck passes.

- [x] 4. Move auth event emitter/types into auth-core (audit bus).  
  - Sanity check: single emitter in auth-core; API/core use it from auth-core; tests updated.  
  - Done: added `packages/auth-core/src/events.ts` (+ tests) and exported via auth-core; updated API imports to use auth-core emitter; removed events from @repo/auth (file/tests/exports) and its extra export path; typechecks for auth-core/auth/api pass.

- [x] 5. Move PAT helpers and session transfer token helpers into auth-core token layer.  
  - Sanity check: PAT + session-transfer tests live under auth-core; API/core imports updated; PAT/token flows still pass tests.  
  - Done: added `token-hash.ts`, `pat.ts`, and `session-transfer.ts` (with tests) to auth-core and exported via `@repo/auth-core`; updated API/core imports to use auth-core helpers; removed PAT/session-transfer/token-hash from `@repo/auth`; typechecks/lints for auth-core, api, core now pass.

- [x] 6. Decide RBAC helpers placement (scopes validation).  
  - Sanity check: either migrate to auth-core or clearly document keeping them in primitives; imports consistent; tests updated.  
  - Done: moved RBAC helpers/tests into auth-core (`rbac.ts`, `__tests__/rbac.test.ts`) and exported via `@repo/auth-core`; removed RBAC exports/files from @repo/auth; updated core token-service to import `validateScopes` from auth-core; typecheck/lint pass.

- [x] 7. Clean up `packages/auth` to primitives-only and update docs.  
  - Sanity check: `packages/auth` exports only primitives (hashing, constants, token envelopes, opaque helpers); docs/README reflect ownership; repo typecheck/test pass.  
  - Done: `packages/auth` now exports only scrypt-based password hashing, constants, and session schema; removed higher-order helpers/tests; README/index updated; typechecks pass.

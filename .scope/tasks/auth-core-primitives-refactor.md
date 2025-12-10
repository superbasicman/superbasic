# Auth-core consolidation – move higher-order auth utilities into auth-core

Context: per agents.md, new repo (no legacy), auth-core is the source of truth. Higher-order auth logic currently lives in `packages/auth` (primitives package). Goal: move service-level pieces into `packages/auth-core` to keep primitives lean and avoid duplicated logic. There are no users and this is a new repo, so no legacy compatibility needed. Remove any dead code or docs you encounter along the way.

- [ ] 1. Reconfirm scope and call sites for higher-order helpers in `packages/auth`.  
  - Sanity check: short list of files/functions to move (profile/email/events/pat/session-transfer/rbac) plus their consumers.

- [ ] 2. Move profile provisioning (`ensureProfileExists`) into auth-core service layer.  
  - Sanity check: `packages/auth-core` exports the helper; imports in API/core updated; tests pass for user/profile creation.

- [ ] 3. Move email senders (magic link, verification) into auth-core and re-export there.  
  - Sanity check: `auth-core` owns email orchestration; API routes still send emails successfully in tests/mocks; `packages/auth` no longer exports email senders.

- [ ] 4. Move auth event emitter/types into auth-core (audit bus).  
  - Sanity check: single emitter in auth-core; API/core use it from auth-core; tests updated.

- [ ] 5. Move PAT helpers and session transfer token helpers into auth-core token layer.  
  - Sanity check: PAT + session-transfer tests live under auth-core; API/core imports updated; PAT/token flows still pass tests.

- [ ] 6. Decide RBAC helpers placement (scopes validation).  
  - Sanity check: either migrate to auth-core or clearly document keeping them in primitives; imports consistent; tests updated.

- [ ] 7. Clean up `packages/auth` to primitives-only and update docs.  
  - Sanity check: `packages/auth` exports only primitives (hashing, constants, token envelopes, opaque helpers); docs/README reflect ownership; repo typecheck/test pass.

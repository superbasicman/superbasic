# Auth-Core Migration – Align to End-Auth Goal (no legacy compatibility)

Move ownership of auth tables and flows from the current Auth.js adapter to auth-core, remove legacy compatibility (this is new repo, no users- safe and required to remove dead code), and align code/docs with `docs/auth-migration/end-auth-goal.md`.

Context to review before starting:
- this is new repo, no users- safe and required to remove dead code
- `agent/context-map.md` (architecture, HTTP API design, domain services, security/git workflow, delivery hygiene)
- `docs/auth-migration/end-auth-goal.index.md` sections: 0 (threat model), 1 (architecture), 2.1 (users/identities), 2.2 (AuthContext), 3 (token taxonomy incl. 3.3/3.4), 5.6 (RLS & GUCs), 5.14 (migrations), 5.17 (v1 simplifications)
- Constraint: new repo, no users — no legacy compatibility needed; delete dead Auth.js code/configs and correct docs to the end-auth goal.

---

- [x] 1. Inventory current Auth.js footprints and legacy auth-table ownership (code, schema, configs).  
  - Sanity check: short list of files/dirs and tables tied to Auth.js adapters or owning `users/accounts/sessions/verification_tokens`.
  - Findings:
    - Packages: `packages/auth/` (Auth.js adapters/config + README + tests; depends on @auth/core/prisma-adapter), `packages/types/package.json` typecheck skip due to Auth.js types.
    - Apps: `apps/web/src/lib/api.ts`, `apps/web/src/hooks/useAuthForm.ts`, `apps/web/src/contexts/AuthContext.tsx` mention Auth.js; `apps/api/src/types/context.ts` carries “legacy Auth.js bindings” note; `apps/api/src/test/helpers.ts`, `apps/api/src/test/README.md`, `apps/api/vitest.*` refer to Auth.js session token; `packages/auth-core` not present yet.
    - Tooling/scripts: `tooling/scripts/check-auth-env.ts`, `tooling/scripts/setup-env.ts`, `tooling/scripts/curl-test.sh`, `tooling/scripts/README.md` validate Auth.js secrets/tables.
    - Docs/agent: `README.md`, `QUICKSTART.md`, `GEMINI.md`, `docs/oauth-setup-guide.md`, `docs/oauth-mvp.md`, `docs/vercel-deployment-guide.md`, `agent/agents.md`, `agent/full-agents.md`, `agent/steering/**` database/auth docs reference Auth.js ownership; `docs/auth-migration/end-auth-goal.md` notes current Auth.js ownership.
    - Database: `packages/database/schema.prisma` + `migrations/*` define auth tables (users, user_identities, auth_sessions, refresh_tokens, verification_tokens, api_keys, session_transfer_tokens) already under auth-core naming but currently assumed owned by Auth.js in docs; check ownership stance during migration.

- [x] 2. Define target-state changes to move ownership into auth-core (schemas, services, routes) and drop legacy paths.  
  - Sanity check: written change list mapping removals/rewires to end-auth goal sections (tokens, sessions, PATs, AuthContext, RLS/GUCs).
  - Target-state notes (aligned to `docs/auth-migration/end-auth-goal.md`):
    - Ownership: Remove `@repo/auth` (Auth.js) adapters/config; auth tables (users, identities, sessions, refresh tokens, PATs, verification tokens) are owned/served by auth-core service and Prisma repositories (`end-auth-goal` sections 1, 3, 4, 5.6).
    - API surface: `/v1/auth/*` and `/v1/oauth/*` handlers rely solely on auth-core token/session issuance + hash envelopes (sections 3.1–3.5); no Auth.js cookie/session semantics or `authjs.session-token`.
    - Clients: Web/mobile/CLI flows use OAuth 2.1 + PATs per end-auth goal; remove Auth.js-specific callbacks or docs (sections 3.3, 3.4, 5.3, 5.17).
    - Tooling: Delete Auth.js env/setup scripts and quickstart steps; replace with auth-core bootstrap (sections 5.14, 5.17).
    - RLS/GUCs: Standardize on app.user_id, app.profile_id (when profile-scoped), app.workspace_id, app.mfa_level, app.service_id set/cleared by auth middleware (section 5.6).

- [x] 3. Update documentation to reflect auth-core ownership only and remove legacy compatibility guidance (agent/agents.md, auth docs).  
  - Sanity check: docs no longer reference Auth.js ownership or legacy migration caveats; they state auth-core as source of truth.
  - Updates so far: `agent/agents.md`, `agent/full-agents.md` (preamble + auth section), `README.md`, `QUICKSTART.md`, `GEMINI.md`, `docs/oauth-mvp.md`, `docs/oauth-setup-guide.md`, `docs/vercel-deployment-guide.md`, `docs/auth-migration/end-auth-goal.md`.
  - TODO: Clean remaining legacy mentions in `agent/full-agents.md` (embedded steering excerpts) and any downstream steering docs that still reference Auth.js.

- [ ] 4. Remove or refactor code/schema/config to eliminate Auth.js adapters and legacy flows; ensure auth tables live under auth-core.  
  - Sanity check: codebase builds/tests (e.g., `pnpm --filter apps/api test -- --run` if applicable) with only auth-core paths referencing auth tables.

- [ ] 5. Verify RLS/GUC alignment with end-auth goal (app.user_id, app.profile_id when applicable, app.workspace_id, app.mfa_level, app.service_id) and clean up any legacy wiring.  
  - Sanity check: DB access layer sets/clears correct GUCs per AuthContext; no stray legacy GUC usage remains.

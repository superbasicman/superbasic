# Current Phase Context

**Active Phase**: Phase 5 – Personal Access Tokens (PATs) Hardening  
**Status**: ✅ Phase 5 complete  
**Current Task**: (none – Phase 5 tasks completed)
**Spec Location**: `.scope/tasks/phase-5-pats.md` (see also `docs/auth-migration/auth-migrate-phases.md` Phase 5)  
**Previous Phase**: Phase 4 – Scopes, Roles & Workspace AuthZ (✅ complete)

---

## Phase 5 Overview

**Goal**: Ensure PATs fully match the new auth-core role/scope model and workspace enforcement so automation/CLI traffic follows the same authorization rules as sessions.

**Scope**:
- PAT verification incorporates workspace binding and role-derived scopes (auth-core).
- `/v1/tokens` routes enforce ownership and scope validation consistently (API).
- Middleware cleanly separates PAT vs session scope checks.
- Docs/SDK describe the final PAT flow and required env/config.

**Exit Criteria**:
- PAT verification tests pass in auth-core (roles/scopes/workspace handling).
- `/v1/tokens` integration tests pass with scope/ownership enforcement.
- Scope middleware tests cover PAT vs session behaviors.
- Docs reflect PAT expectations; builds succeed with documented env vars.
- `pnpm deploy-check --full` passes (with external DB/Redis available).

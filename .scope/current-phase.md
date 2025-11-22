# Current Phase Context

**Active Phase**: Phase 8 – UX & Operational Tools  
**Status**: 🚧 In progress  
**Current Task**: Task 1 – Author spec (devices/PAT UI/admin/account deletion)  
**Spec Location**: `.scope/tasks/phase-8-ux-and-ops.md` (see also `docs/auth-migration/auth-migrate-phases.md` Phase 8)  
**Previous Phase**: Phase 7 – Security Hardening (✅ complete)

---

## Phase 8 Overview

**Goal**: Expose auth/session controls to end users and support, and make operations straightforward.

**Scope**:
- Manage Devices UI backed by `/v1/auth/sessions` + revoke endpoint.
- API Tokens (PAT) UI backed by `/v1/tokens` create/list/update/delete.
- Admin/support tools for bulk session/PAT revocation and incident views.
- Account deletion flow that revokes tokens and handles workspace ownership/retention.

**Exit Criteria**:
- Users can self-manage devices and API tokens via UI.
- Support can bulk revoke sessions/PATs and inspect incidents by identifiers.
- Account deletion enforces revocation and workspace ownership rules per policy.
- Docs updated; build/typecheck/tests pass for new flows.

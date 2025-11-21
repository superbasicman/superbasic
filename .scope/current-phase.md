# Current Phase Context

**Active Phase**: Phase 6 – OAuth/PKCE for Native Apps & IdP Abstraction  
**Status**: 🚧 In progress  
**Current Task**: Task 3 – `/v1/oauth/authorize` endpoint (PKCE code issuance)  
**Spec Location**: `.scope/tasks/phase-6-pkce.md` (see also `docs/auth-migration/auth-migrate-phases.md` Phase 6)  
**Previous Phase**: Phase 5 – PATs Hardening (✅ complete)

---

## Phase 6 Overview

**Goal**: Deliver native-friendly OAuth 2.1 Authorization Code + PKCE flows and formalize the IdP abstraction so mobile clients can log in via system browser and exchange codes for tokens.

**Scope**:
- IdentityProvider abstraction implemented for current IdP (Auth.js) and used by `/v1/auth/token` + new OAuth endpoints.
- `/v1/oauth/authorize` issues single-use auth codes (PKCE-bound) after login.
- `/v1/oauth/token` validates code + PKCE verifier, creates `Session` (`clientType='mobile'`), issues access/refresh tokens.
- OAuth client validation (seed `client_id = 'mobile'`, redirect URI allowlist).
- Docs/SDK updated to describe mobile PKCE flow and config.

**Exit Criteria**:
- Auth-core supports PKCE/code handling and IdP abstraction with tests passing.
- `/v1/oauth/authorize` and `/v1/oauth/token` integration tests pass for mobile PKCE flow.
- Tokens issued via PKCE create mobile sessions; role/scope enforcement remains intact.
- Docs updated for Phase 6 with client setup and flow notes; builds/typechecks succeed.
- `pnpm deploy-check --full` passes (with external DB/Redis available).

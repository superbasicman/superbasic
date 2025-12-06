# Auth Architecture Quick Reference

Short summary of the end-state auth/authorization design so decisions stay discoverable. See `docs/auth-migration/end-auth-goal.md` for full detail.

## Scope & Threats
- IdP-agnostic, OAuth 2.1-style AS with basic OIDC; supports web, mobile/Capacitor, CLI, service-to-service.
- Protect against stolen tokens (access/refresh/PAT), compromised accounts, tenant leakage, malicious clients; assume TLS + reasonable infra security.
- Non-goals for now: ABAC, support impersonation, complex OAuth/OIDC (device flow, back-channel logout, etc.).

## Core Architecture
- Components: external and first-party IdP (email/password + magic link, Google), auth-core issuing sessions/JWT access/opaque refresh/PATs, application API consuming AuthContext + Postgres RLS via GUCs.
- AuthContext drives all decisions; sets `app.user_id`, `app.workspace_id`, `app.mfa_level` (and service_id when relevant).
- Workspace is the tenant boundary; roles map to scopes; effective perms = token scopes ∩ workspace role ∩ RLS.

## Data & Identity Model
- Users have unique emails while active; soft delete allows reuse after cooling-off.
- User identities keyed by (provider, provider_subject); VerifiedIdentity abstraction normalizes IdP claims.
- Workspaces: personal/shared; memberships unique per workspace/user with roles owner/admin/member/viewer.

## Token Strategy
- Opaque tokens use canonical `<prefix>_<tokenId>.<secret>` with hash envelopes (no raw storage); `tokenId` lookup then hash verify.
- JWT access tokens: short-lived, minimal claims; not sole source of authorization.
- Refresh tokens: per-session family, rotate on use; reuse baseline = first incident treated as benign race, otherwise future heuristics may revoke family.
- PATs/API keys: primary external integration surface; workspace-scoped by default; revocable, hash-enveloped, sent as `Authorization: Bearer <pat>`.
- Service credentials: client credentials tied to service identities; prefer asymmetric or mTLS where higher sensitivity.

## OIDC/OAuth Behavior
- Endpoints: auth code + PKCE, token (exchange/refresh/client credentials), revoke, introspect (optional), JWKS, discovery, userinfo.
- V1 focuses on first-party clients; third-party consent/grants deferred. Future third-party clients use pairwise subs; first-party uses public subs.
- JWT keys use kid + JWKS; no implicit grant.

## Defaults & Security Parameters
- Access TTL 10m (5–15m allowed); Refresh TTL 30d with ~14d idle timeout; Sessions 30d (~14d idle).
- PATs expire 30–90d; no never-expire keys.
- MFA required for high-risk actions (bank connections, PAT management, exports, workspace ownership changes); mfaLevel stored on session; map IdP AMR/ACR when available.

## Platform Guidance
- Web: access token in memory; refresh in HttpOnly Secure cookie; CSRF protection on mutating cookie flows.
- Mobile/Capacitor: store tokens in OS secure storage; refresh via body or Authorization header.
- CLI/automation: prefer PATs; otherwise access+refresh stored in OS keychain.
- Service-to-service: OAuth client credentials; PKCE required even for public clients; confidential clients authenticate via configured method.

## RLS/GUC Discipline
- Every request sets GUCs from AuthContext; clear/reset per connection use to avoid leakage.
- Tenant tables include workspace_id; RLS enforces `workspace_id = current_setting('app.workspace_id')`.
- MFA-aware policies via `app.mfa_level`; service-only actions check `app.service_id`.

## Logging, Rate Limits, Admin
- Rate limit auth-centric endpoints per IP/user/client_id; stronger limits on password/MFA.
- Security events log logins, MFA, refresh reuse, PAT lifecycle; consider separate audit log for financial actions.
- Admin/support: dedicated routes; no RLS bypass; log actions. Impersonation deferred.

## V1 Simplifications & Priorities
- Ship: email/password + magic-link + Google sign-in; PAT UI/API from day one; small scope set mapped from roles; PAT workspace scoping default.
- Keep OAuth surface first-party only for now; PATs = main external access.
- For high-risk paths, prefer DB lookups over cache; allow small service-identity allowlists; remember-me adjusts session TTL within safe bounds.

## Open/Future Work
- Refine refresh reuse heuristics; add pairwise subs for third parties; add WebAuthn/passkeys; device flow if needed.
- Add sid/jti denylist for near-real-time access token revocation; expand admin tooling (bulk revocation, incident response).

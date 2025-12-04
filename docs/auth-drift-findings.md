# Auth Drift Findings

Context: Section-by-section comparison of `docs/auth-migration/end-auth-goal.md` against the current implementation. Notes capture drift and confirmations with file:line references; scope enforcement and token format/hash gaps remain the biggest risks. Use the section map below to navigate.

Plan/code map for drift review (baseline from `current-auth-implementation.md`):
- Pipeline: `apps/api/src/middleware/auth-context.ts`, `apps/api/src/middleware/scopes.ts`, `apps/api/src/auth.ts`.
- Auth core: `packages/auth-core/src/service.ts`, `packages/auth-core/src/signing.ts`, `packages/auth-core/src/token-service.ts`, `packages/auth-core/src/authz.ts`, `packages/auth-core/src/config.ts`.
- Auth utilities: `packages/auth/src/pat.ts`, `packages/auth/src/token-hash.ts`, `packages/auth/src/password.ts`, `packages/auth/src/events.ts`.
- Routes/flows: `apps/api/src/routes/v1/auth/*`, `apps/api/src/routes/v1/oauth/*`, `apps/api/src/lib/pat-tokens.ts`.
- Schema: `packages/database/schema.prisma` (users, user_identities, sessions, tokens, oauth_clients, oauth_authorization_codes).
- Section map: 0 — threat model; 1 — architecture; 2 — data model & AuthContext; 3 — tokens/sessions/PATs; 4 — invariants; 5 — implementation details; 6 — summary alignment.

## Section 0 — Threat model & non-goals
- Stolen bearer protection: session-auth requests bypass scope enforcement, so a stolen session access token grants full access instead of intersecting token scopes with workspace roles (`apps/api/src/middleware/scopes.ts:33-37`).
- Stolen refresh handling: refresh token reuse revokes the entire family + session on first incident (no benign-race allowance or IP/UA heuristics), diverging from the fail-safe but tolerant policy in the goal (`apps/api/src/routes/v1/auth/refresh-utils.ts:61-124`).
- PAT scope safety: PAT verification can inject requested scopes (including `admin`) beyond stored/workspace scopes, increasing blast radius of a stolen PAT (`packages/auth-core/src/service.ts:565-578`).

## Section 1 — High-level architecture
- Auth-core vs app boundary: API middlewares call `authService.verifyRequest` and set Postgres GUCs, aligning with the AuthContext boundary (`apps/api/src/middleware/auth-context.ts:20-142`), but auth-core lives as an in-process library rather than a separate service.
- IdP coverage: first-party email/password and magic-link plus Google are implemented as custom routes, not via a central IdP adapter layer (`apps/api/src/routes/v1/auth/signin.ts:18-91`, `apps/api/src/routes/v1/auth/magic-link.ts`, `apps/api/src/routes/v1/auth/google.ts:1-200`).
- Route layering: sign-in routes perform Prisma access directly in handlers instead of delegating to core services, so the “thin route handler” pattern is not consistently applied (`apps/api/src/routes/v1/auth/signin.ts:25-91`).
- Workspace/GUC setup: AuthContext sets `app.user_id/app.workspace_id/app.mfa_level` per request as expected (`apps/api/src/middleware/auth-context.ts:89-110`), but PAT requests are short-circuited here and rely on downstream middleware to populate context (`apps/api/src/middleware/auth-context.ts:24-38`), which can be brittle if routes forget to mount `unifiedAuthMiddleware`.

## Section 2 — Data model & AuthContext
- AuthContext shape: missing `principalType`, `serviceId`, `clientId`, `allowedWorkspaces`, and `mfaLevel` is present but no `mfaCompletedAt`; current type is user-only (`packages/auth-core/src/types.ts:60-71`).
- Workspace selection rules: resolution happens in auth-core, but PAT requests skip `attachAuthContext` and set GUCs only after middleware, creating a potential gap if routes omit `unifiedAuthMiddleware` (`apps/api/src/middleware/auth-context.ts:24-38`).
- Pairwise subject IDs for third-party clients are not modeled; only public subs are used in tokens today.
- Schema gaps: `service_identities` and `client_secrets` exist in Prisma but are unused; no AuthContext fields or enforcement for service principals (`packages/database/schema.prisma`).

## Section 3 — Tokens, sessions, PATs
- Token format: opaque tokens use `uuid.secret` (no prefix); PATs use `sbf_<base64>`; goal format `<prefix>_<tokenId>.<secret>` not adopted (`packages/auth/src/token-hash.ts:129-136`, `packages/auth/src/pat.ts:18-45`).
- Hash envelopes: token hashing uses HMAC without per-token salt/KMS metadata; goal expects hash envelopes with salt/key_id (`packages/auth/src/token-hash.ts:64-85`).
- Access tokens: signed JWTs lack scopes claim and rely solely on membership for scopes, so token-level scope caps are absent (`packages/auth-core/src/signing.ts:102-135`, `packages/auth-core/src/service.ts:478-488`).
- Refresh rotation: accepts any non-revoked sibling and revokes family on any reuse (aggressive); does not enforce “current token only” rule (`apps/api/src/routes/v1/auth/refresh.ts:69-175`, `apps/api/src/routes/v1/auth/refresh-utils.ts:61-124`).
- PAT issuance/validation: scopes can be elevated by requested scopes and `admin` injection; workspace scoping is optional and not enforced for multi-workspace users (`packages/auth-core/src/service.ts:565-578`, `apps/api/src/middleware/scopes.ts:33-37`).
- TTL defaults: PAT default expiry 1 year in auth-core, 90 days in routes; refresh/session TTLs diverge from goal defaults (goal: access 10m, refresh 30d, session 30d) — current access 15m, refresh/session 30d with 7d sliding window (`packages/auth-core/src/config.ts`, `apps/api/src/routes/v1/auth/signin.ts:75-88`).

## Section 4 — Core invariants
- RLS/GUCs: app sets `app.user_id/app.workspace_id/app.mfa_level` per request (`apps/api/src/middleware/auth-context.ts:89-110`), but PAT requests bypass this middleware and rely on other middleware to set context; risk of missed GUCs if routes omit `unifiedAuthMiddleware`.
- Scope/role intersection: session requests bypass scope checks entirely (`apps/api/src/middleware/scopes.ts:33-37`), so invariants about intersecting token scopes with roles/RLS are not enforced for sessions.
- Workspace requirement: workspace resolution allows null/last workspace; no strict requirement on workspace header for multi-workspace users or PATs, weakening tenant isolation guarantees.

## Section 5 — Implementation details
- 5.1 Transport/storage: tokens hashed with HMAC, no per-token salt/key_id envelope; secrets not logged, but no KMS-style metadata (`packages/auth/src/token-hash.ts:64-85`). Refresh cookies use double-submit CSRF (`apps/api/src/routes/v1/auth/refresh.ts:57-88`).
- 5.3 Session flows: sign-in routes (password/Google/magic-link) are custom, not unified via an IdP adapter layer; Auth.js CSRF skipped and cookies stripped (`apps/api/src/routes/v1/auth/signin.ts:25-91`, `apps/api/src/routes/v1/auth/google.ts:1-200`).
- 5.4 Workspace selection: resolution is implicit (header/path/default workspace or last workspace); no enforced `X-Workspace-Id` for multi-workspace tokens; PATs can be user-scoped without workspace binding (`packages/auth-core/src/service.ts:461-488`, `apps/api/src/middleware/auth-context.ts:24-38`).
- 5.5 Service identities: schema exists but unused; no AuthContext support for `serviceId`/client credentials flows beyond basic OAuth token endpoint; no enforcement of allowedWorkspaces (`packages/database/schema.prisma`, `packages/auth-core/src/types.ts:60-71`).
- 5.7 OAuth server: only authorization code + PKCE + refresh are implemented; no revoke/introspect/userinfo or JWKS metadata beyond basic JWKS; third-party consent/grants absent (`apps/api/src/routes/v1/oauth/token.ts`, `apps/api/src/routes/v1/oauth/authorize.ts`).
- 5.8 MFA: mfaLevel tracked on sessions/access tokens, but no per-endpoint MFA enforcement for high-risk actions; no MFA challenge endpoints in API (`apps/api/src/routes/v1/auth/*`, `apps/api/src/middleware/scopes.ts`).
- 5.9 Error semantics: refresh reuse returns 401/403 inconsistently; scopes middleware returns 403 for missing scope, but session bypass undermines consistent 401/403 distinction.
- 5.10 Rate limiting: rate limits exist for refresh/login/magic-link/credentials and PAT creation; no explicit limits on OAuth token/authorize endpoints or PAT use as described in goal (`apps/api/src/middleware/rate-limit/*`, `apps/api/src/routes/v1/auth/*`).
- 5.11 Logging/audit: `authEvents` emitted for many flows, but no `security_events` table usage for refresh reuse, PAT creation, or MFA; no high-severity alerting hooks (`packages/auth/src/events.ts`, `packages/database/schema.prisma:214-240`).
- 5.12 Tenant isolation: relies on GUCs but lacks explicit enforcement hooks if GUC setting fails; no guardrails for cross-tenant joins beyond RLS assumptions.
- 5.13 Admin/support: no admin/support tooling or impersonation patterns implemented.
- 5.14 Backwards compatibility: no versioned token prefixes (rt_/pk_), no pairwise subs, no dual-format handling.
- 5.16 Connection-pool hygiene: GUCs set per request but no explicit clearing on pool release beyond manual reset in middleware error paths.
- 5.17 V1 simplifications: PATs are primary external surface (aligned), but scope enforcement gaps, token formats, and TTL defaults diverge; OAuth is first-party only (aligned), but API uses custom sign-in flows instead of pure OAuth path.

## Section 6 — Summary alignment
- V1 surface mostly present: email/password, magic link, Google sign-in, PATs as external integration, first-party OAuth code+PKCE with refresh.
- Notable drift: scope enforcement (sessions bypass, PAT elevation), token format/hash envelope, workspace selection strictness, unused service identities, MFA enforcement absent, OAuth surface missing revoke/introspect/userinfo/consent, token TTL defaults diverge, no KMS-style hashing.

Snapshot of auth gaps versus `docs/auth-migration/end-auth-goal.md`. File/line references point to current implementation.

- Session scope bypass: session-authenticated requests skip scope enforcement, giving full access instead of intersecting token scopes with workspace roles (`apps/api/src/middleware/scopes.ts:33-37`).
- PAT scope elevation: PAT verification falls back to requested scopes and even injects `admin` when missing, so scopes can exceed workspace permissions (`packages/auth-core/src/service.ts:565-578`).
- Token format divergence: opaque tokens are `uuid.secret` without a prefix (`packages/auth/src/token-hash.ts:129-136`); PAT utils mint `sbf_<base64>` (`packages/auth/src/pat.ts:18-45`); auth-core PAT issuance uses opaque format (`packages/auth-core/src/service.ts:288-318`). Target format is `<prefix>_<tokenId>.<secret>` for refresh/PATs.
- Refresh reuse handling too aggressive: any reuse revokes the entire family + session with no allowance for benign races or IP/UA heuristics (`apps/api/src/routes/v1/auth/refresh-utils.ts:61-124`).
- Refresh validation lenient: refresh rotation accepts any non-revoked sibling; it does not ensure the presented token is the current token for its session/family before rotation (`apps/api/src/routes/v1/auth/refresh.ts:69-175`).
- Access-token scopes absent: access tokens carry no scopes claim and verification derives scopes only from membership, so token-level scope limits are ignored (`packages/auth-core/src/signing.ts:102-135`, `packages/auth-core/src/service.ts:478-488`).
- Hash envelopes minimal: opaque token hashing lacks per-token salt/KMS-style envelope metadata expected for long-lived opaque credentials (`packages/auth/src/token-hash.ts:64-85`).

# Auth Architecture Plan (auth.md)

Goal: Define the end-state authentication & authorization architecture for SuperBasic Finance that:

- Works cleanly for web, Capacitor, native mobile, CLI, and service-to-service.
- Is IdP-agnostic (supports multiple identity providers over time).
- Centralizes auth into a single, well-defined core.
- Meets modern security expectations (short-lived access, refresh rotation with reuse detection, scoped tokens, multi-tenant safety).
- Provides a fully functional OAuth 2.1-style authorization server.
- Provides basic OpenID Connect (OIDC) compatibility (code flow + id_token + userinfo) for first- and third-party clients.

Current state note: the live system uses an Auth.js adapter that owns `users`, `accounts`, `sessions`, and `verification_tokens`. This plan assumes migrating those responsibilities into auth-core while keeping user identifiers stable and mapping data forward.

This describes the target polished design, as if for a new refactor. For v1, we can ship a smaller subset; heuristics and UX flows can be refined during implementation.

--------------------------------------------------
0. THREAT MODEL & NON-GOALS
--------------------------------------------------

0.1 Threat model

We care about protecting against:

- Stolen bearer credentials:
  - Compromised access tokens.
  - Compromised refresh tokens/PATs.
- Compromised user accounts:
  - Password reuse attacks vs IdP.
  - Phishing of IdP credentials.
  - Reused social/OIDC accounts.
  - Malicious reuse of revoked refresh tokens or PATs.
- Tenant isolation failures:
  - Cross-tenant data leaks due to bugs in authorization logic.
  - Misconfigured RLS or GUCs leaking data between users/workspaces.
- Malicious clients:
  - Abusing OAuth flow to impersonate users.
  - Misusing PATs or client credentials.
- Insider misuse:
  - Admin/service principals accessing tenant data without explicit need.

We assume:

- Transport security (TLS) is in place for all external traffic.
- Underlying infrastructure (KMS/HSM, secret storage, etc.) is reasonably secure.
- We are not defending against state-level attackers, hardware side-channel attacks, or compromised end-user devices beyond our control.

0.2 Non-goals (initially)

Not a priority for initial implementation:

- Fine-grained, attribute-based access control (ABAC) beyond roles + scopes.
- Delegated user impersonation/“login as user” for support (can be added later).
- Fully generic policy engine (e.g. OPA) integrated into runtime.
- Cross-tenant resource sharing (beyond simple “shared workspace” concept).
- Complex OAuth2/OIDC flows (device code, back-channel logout, etc.) beyond what’s needed for first-party clients and simple third-party integrations.

--------------------------------------------------
1. HIGH-LEVEL ARCHITECTURE
--------------------------------------------------

1.1 Components

- IdP(s):
  - One or more external identity providers (Google, etc.) and/or a first-party IdP.
  - Provide identity assertions (id_tokens, SAML assertions, etc.).
  - Might also provide MFA / AMR / ACR claims.
  - For v1:
    - A first-party IdP for email/password and email magic-link.
    - Google as an external OIDC provider.

- Auth-Core (our service):
  - Normalizes identity assertions into a VerifiedIdentity.
  - Issues and validates:
    - Sessions.
    - Access tokens (JWT).
    - Refresh tokens (opaque).
    - Personal Access Tokens (PATs) / API keys.
  - Maintains:
    - Users.
    - Workspaces.
    - Memberships.
    - Service identities.
  - Exposes:
    - OAuth 2.1-style authorization server endpoints.
    - OIDC endpoints (authorization, token, userinfo, jwks).

- Application API (our main app):
  - Receives access tokens / cookies / PATs.
  - Validates them with auth-core.
  - Constructs AuthContext for business logic.
  - Uses Postgres Row-Level Security (RLS) with GUCs for strong data isolation.

1.2 Logical flow

- User signs in via IdP (OIDC, etc.) or via the first-party IdP (email/password or magic-link).
- Auth-core:
  - Maps the IdP identity to a local User.
  - Creates a Session (with optional MFA state).
  - Issues a short-lived access token (JWT) and refresh token (opaque).
- Frontend stores access token in memory and refresh token in HTTP-only cookie; or for CLI/mobile, both tokens stored securely in local OS keychain.
- API requests:
  - Include `Authorization: Bearer <access_token>` or use session cookie.
  - API or gateway calls auth-core (or local validation logic) to:
    - Validate token.
    - Resolve to Session, User, Workspaces, Roles, Scopes, MFA level.
  - API constructs AuthContext and sets Postgres GUCs like:
    - app.user_id
    - app.workspace_id
    - app.mfa_level
  - RLS policies enforce per-tenant access at the DB layer.

--------------------------------------------------
2. DATA MODEL & CORE CONCEPTS
--------------------------------------------------

2.1 Users and identities

Users table

Core fields:

- id (UUID, stable)
- created_at, updated_at, deleted_at (soft delete)
- primary_email, email_verified
- display_name
- user_state (active, disabled, locked)
- default_workspace_id (for UX)
- last_login_at

Email uniqueness:

- Email should be unique among active users (soft uniqueness is acceptable, allowing reuse after deletion).

Account deletion and email reuse:

- Email uniqueness applies only across active users; deleted users’ emails can be reused after a cooling-off period.

User identities (IdP linkage)

Table user_identities (or similar):

- id
- user_id
- provider (enum: google, github, auth0, local_password, local_magic_link, etc.)
- provider_subject (string, non-PII, opaque from IdP or local id)
- email_at_provider and email_verified_at_provider
- raw_profile (JSONB, optional)
- created_at, updated_at, linked_at

Rules:

- (provider, provider_subject) must be unique.
- A given (provider, provider_subject) maps to at most one user_id at a time.
- Users may have multiple identities (Google + email/password, etc.) depending on policy.
- Tenants may restrict which providers and emails are allowed.

VerifiedIdentity abstraction

A small object produced by IdP adapters after validating an assertion:

- provider
- provider_subject
- email
- email_verified
- name
- picture
- raw_claims

This decouples IdP specifics from auth-core logic.

2.2 AuthContext (application view)

All downstream services see an AuthContext, produced by auth middleware.

Pseudo-TypeScript (for description only):

    type AuthContext = {
      principalType: 'anonymous' | 'user' | 'service';
      // Shared fields:
      authTime: Date;
      sessionId?: string;          // For user sessions.
      tokenId?: string;            // For PATs/API keys.
      clientId?: string;           // OAuth client (service or app).
      scopes: string[];            // Derived allowed scopes for this token.
      // User-specific:
      userId?: string;             // Present when principalType === 'user'
      workspaceId?: string;        // Currently selected workspace.
      membershipId?: string;       // Membership in workspace for the user.
      roles?: string[];            // For this workspace.
      mfaLevel?: 'none' | 'mfa' | 'phishing_resistant';
      // Service-specific:
      serviceId?: string;          // Present when principalType === 'service'
      serviceType?: 'internal' | 'external';
      allowedWorkspaces?: string[]; // For service identities that can act in multiple workspaces.
    };

Semantics:

- Human users:
  - principalType = 'user'
  - userId = users.id
  - serviceId = null
  - current_setting('app.user_id') = userId

- Service principals:
  - principalType = 'service'
  - serviceId = service_identities.id
  - userId = null

- Anonymous routes:
  - principalType = 'anonymous'
  - userId and serviceId null

Scopes and roles:

- Scopes reflect maximum allowed actions for this token.
- Roles are mapped to scopes via configuration, not hard-coded inside business logic.
- For each request, effective permissions are the intersection of:
  - Token scopes
  - Workspace membership roles
  - RLS policies (for example workspace_id must match)

2.3 Workspaces & memberships

Workspaces

Table workspaces:

- id (UUID)
- name
- slug (for URLs)
- owner_user_id (for "personal" default workspaces)
- workspace_type:
  - personal (one per user)
  - shared (teams, etc.)
- created_at, updated_at, deleted_at

Each workspace serves as a "tenant" boundary.

Memberships

Table workspace_memberships:

- id
- workspace_id
- user_id
- role (owner, admin, member, viewer)
- created_at, updated_at, invited_at, accepted_at, revoked_at

Constraints:

- (workspace_id, user_id) unique while active.
- owner role has highest privileges for that workspace.
- Personal workspaces may implicitly treat the user as owner even without an explicit membership row.

--------------------------------------------------
3. TOKENS, SESSIONS, AND KEYS
--------------------------------------------------

3.1 Token taxonomy

We use:

- Access tokens (JWT):
  - Short-lived bearer tokens for APIs.
  - Opaque to frontend except for expiration.

- Refresh tokens (opaque):
  - Long-lived opaque tokens, rotated regularly.
  - Bound to a session; subject to reuse detection.

- Personal Access Tokens (PATs) / API keys (opaque):
  - Long or semi-long-lived.
  - Workspace-scoped or user-scoped.
  - Ideal for CLI/automation and as the main external integration surface.
  - Shipped in v1/MVP: PAT creation, listing, revocation, and use are available on day one.

- Service credentials:
  - OAuth client credentials (client_id/client_secret).
  - Possibly signed tokens / mTLS for internal service-to-service.

- Email/verification tokens:
  - For email verification, password reset, invite flows, magic-link sign-in.
  - Opaque and short-lived.

All long-lived opaque tokens use a consistent format and storage strategy.

3.2 Canonical token format & hash envelopes

All opaque tokens follow:

- `<prefix>_<tokenId>.<secret>`

Where:

- prefix indicates type, for example:
  - rt = refresh token
  - pk = PAT key
  - ev = email verification

- tokenId:
  - Random 128-bit or 160-bit string (for example base32/urlsafe).

- secret:
  - Sufficiently large random string (for example 256 bits).
  - Only shown to the client once; never stored in plaintext.

Storage:

We store only a hash envelope (similar to password hashing, but with a KMS- or HSM-backed key), for example:

    {
      "hash": "<HMAC or KDF output>",
      "salt": "<random per-token salt>",
      "key_id": "<KMS key identifier>",
      "hmac_algo": "HMAC-SHA256"
    }

Each token row stores:

- id (tokenId)
- user_id or service_id
- workspace_id (if scoped)
- hash_envelope (JSONB)
- issued_at, expires_at, revoked_at
- last4 (for UX: showing last four characters of the secret)

We never allow lookup by raw secret; we always derive tokenId by parsing the token string and look up by id, then validate the secret with the hash envelope.

Rotation & key management:

- key_id in hash envelope allows us to rotate HMAC/KMS keys gradually.
- New tokens use latest key.
- Verification uses key_id to select key.

Provider credentials that must be reused (Plaid, Stripe, webhooks, etc.)

- We cannot "hash-only" these because we must send them in plaintext to providers.
- Store them encrypted with KMS/HSM-backed keys:
  - ciphertext
  - key_id
  - algo
- Where possible, rotate provider credentials by asking provider for new credentials and updating the record; old credentials are invalidated.

3.3 Sessions and refresh tokens

Sessions:

- Represent a logical login on a device or browser.

Table auth_sessions:

- id
- user_id
- created_at, updated_at, expires_at
- last_activity_at
- mfa_level:
  - none, mfa, phishing_resistant
- mfa_completed_at
- client_info (JSONB: user-agent, device, etc.)
- ip_address (optional, minimal logging)

Refresh tokens:

Table refresh_tokens:

- id (tokenId)
- session_id
- user_id
- family_id (for rotation)
- hash_envelope
- issued_at, expires_at, revoked_at
- last_used_at
- created_by_ip, last_used_ip, user_agent
- rotated_from_id (previous token in chain)

Policies:

- Each auth_session has exactly one current refresh token at a time.
- All refresh tokens for a session share a family_id.
- On each successful refresh:
  - A new refresh token is created with the same family_id and same session_id.
  - The previously active refresh token is marked revoked_at = now().

Refresh flow:

1) Validate token via hash envelope and basic checks (type, expiry, revoked_at).  
2) Verify that token is the current (non-revoked) token for its session_id and family_id.  
3) If valid and family_id is active:
   - Create new refresh token with same family_id and session_id.
   - Mark previous token revoked_at = now().
   - Issue new access token.

Reuse handling (v1 baseline and future):

- V1 baseline:
  - First incident of reuse within a short window and same IP/UA:
    - Treat as a likely benign race condition.
    - Return 401 invalid refresh.
    - Do not revoke the family.
    - Emit a low-severity security_event for observability.

- Future refinement:
  - Add more nuanced heuristics beyond the first-incident rule (for example timing, IP/UA similarity, and frequency).
  - Suspicious reuse (for example different IP/UA, long delay since last use, or repeated attempts):
    - Revoke all tokens in that familyId.
    - Optionally revoke all sessions for that user.
    - Emit a high-severity security_event.
    - Notify the user and require full re-auth.

Exact heuristics and thresholds are implementation details; behavior is "fail safe" in suspicious cases.

3.4 Personal Access Tokens (PATs) / API keys

- Long or semi-long-lived opaque tokens using canonical format.
- Stored as hash envelopes in api_keys.key_hash.
- Bound to:
  - user_id (owner)
  - Optional workspace_id
- scopes specify maximum allowed operations.
- Included in v1/MVP:
  - Users can create, list, and revoke PATs on day one.
  - PATs are the primary way for users to access their data programmatically.

Policy (v1 baseline):

- Regular users:
  - PATs should be workspace-scoped when possible.
  - No "never expires" PATs; enforce a maximum lifetime (for example 90 days, see defaults in 3.7).

- Admin/service:
  - Can issue broader PATs, but with shorter lifetimes and stricter logging.

Revocation:

- Revoking an api_key marks revoked_at and prevents further use.
- Does not affect other sessions/tokens unless configured.

Audit:

- Log PAT creation, last use, and revocation.
- Show last-used information in UI to help users manage keys.

Authorization header for PATs:

- PATs are always sent as `Authorization: Bearer <pat>`.
- We do not support `Authorization: Token <pat>` to keep clients and docs simpler.
- Client SDKs will generally infer and attach the correct workspace identifier based on PAT metadata or configured defaults, so most users do not need to manually manage workspace headers.

3.5 Access tokens (JWTs)

- JWTs are signed access tokens with minimal claims:
  - sub (subject)
  - iss, aud, exp, iat
  - sid (session id for users)
  - jti (token id, optional for denylist or introspection)
  - scp (scopes, optional; never used as sole source of truth)

For user tokens:

- sub = users.id

For service principals:

- sub = service_identities.id (optionally namespaced)

For PAT-based access:

- V1 and default behavior:
  - Treat PATs as primary bearer credentials, not re-wrapped as JWTs.
  - Each request validates the PAT directly against DB/cache and constructs AuthContext from the associated api_key row and workspace membership.
- Future optimization (not implemented in v1):
  - We may add an optional exchange endpoint that swaps a PAT for a short-lived JWT with sub and scp, to reduce introspection overhead for very high-throughput clients.

Scopes in JWT:

- JWT scopes are hints; the true permissions come from:
  - The token’s stored metadata (if we introspect)
  - Workspace memberships and roles
  - RLS policy in Postgres

Expiration:

- Access tokens are short-lived; see 3.7 for default TTLs and allowed ranges.
- By default, exp = now + the configured access token TTL.

Revocation strategies for access tokens:

- Primarily rely on short TTL.
- For high-risk tokens:
  - Optional sid or jti-based denylist in Redis/DB for early revocation.
- For PATs:
  - Revocation is immediate for subsequent uses because each request requires introspection against DB or cache.

3.6 OIDC id_tokens

- id_tokens are JWTs representing identity in OIDC flows.

Claims:

- Standard OIDC:
  - iss, aud, sub, exp, iat, nonce, auth_time, etc.
- Optional user claims:
  - email, email_verified, name, picture

sub semantics:

- For first-party clients:
  - Use public subject identifiers derived from users.id and stable over time for human users.
- For third-party/external OAuth/OIDC clients:
  - Use pairwise subject identifiers derived via a mapping table so different clients cannot correlate users.
  - This pairwise mapping is per (user_id, client_id).
- Service principals:
  - Use stable service identifiers and do not participate in pairwise subject mappings.
- V1 behavior and future stance:
  - V1 ships with first-party clients only, using public subs.
  - When third-party clients are introduced, they will use pairwise subs by design.

Implementation pattern:

- Maintain both:
  - A stable internal user id (users.id).
  - A mapping table from (user_id, client_id) to pairwise_sub.
- When issuing id_tokens for third-party clients:
  - Use pairwise_sub as sub.
- When issuing for first-party clients:
  - Use public sub based on users.id.

Future work here is about refining migration/edge cases around pairwise subs, not introducing them.

3.7 Default security parameters (baseline)

Configurable but with strong defaults, centralized here to avoid spec drift.

Access tokens:

- TTL: 10 minutes
- Allowed range: 5–15 minutes

Refresh tokens:

- TTL: 30 days
- Idle timeout: tokens older than 14 days since last use require full re-auth (configurable)

Sessions:

- TTL: 30 days
- Idle timeout (no activity): 14 days

PATs:

- TTL: 30–90 days, configurable per scope/role
- No non-expiring keys

Passwordless IdP sessions (first-party IdP):

- We host a first-party IdP for email/password and email magic-link.
- IdP sessions support flows like magic-link login and password reset while keeping browser UX smooth.

MFA policy:

- High-risk actions (bank connections, exporting data, PAT management, workspace ownership changes) require mfa or phishing_resistant depending on risk level.

--------------------------------------------------
4. CORE INVARIANTS
--------------------------------------------------

The system relies on:

- Single canonical user id: users.id.
- All auth decisions go through AuthContext.
- JWT access tokens:
  - Short-lived.
  - Used to locate session/user/service.
  - Never the sole source of authorization.
- Opaque, hash-enveloped refresh tokens and PATs:
  - Raw secrets never stored.
  - Always look up by tokenId and verify secret with hash envelope.
- Workspace is the core unit of data isolation:
  - RLS in Postgres uses workspace_id.
  - GUCs (current_setting('app.workspace_id')) must be set per request.
- For any action, allow only if:
  - Token is valid and not revoked.
  - AuthContext indicates appropriate user/service identity.
  - Workspace-level role and scopes allow the action.
  - RLS constraints are satisfied.

--------------------------------------------------
5. IMPLEMENTATION DETAILS
--------------------------------------------------

5.1 Transport & storage

Transport:

- All external endpoints are HTTPS only.
- Internal service-to-service traffic is also TLS-encrypted (or restricted via private network).

Storage:

- Secrets never logged.
- Raw tokens only handled in memory and ephemeral request scope.
- Hash envelopes and encryption keys are managed via KMS/HSM with strict access controls.

5.2 Client platforms

Web:

- Access token:
  - Stored in memory only (React state, etc.).
- Refresh token:
  - Stored in HttpOnly, Secure cookie.
- CSRF:
  - Authorization server endpoints that mutate state should use CSRF protection (for cookie-based flows).
- Sign-in:
  - Browser-based OIDC authorization code + PKCE for Google.
  - First-party email/password and magic-link flows mediated by auth-core and normalized into VerifiedIdentity.
  - redirect_uri validated strictly against registered values.

Mobile (native / Capacitor):

- Access and refresh tokens stored in secure OS storage (Keychain / Keystore).
- API calls use `Authorization: Bearer <access_token>`.
- Refresh endpoint accepts the refresh token in request body or Authorization header.

CLI / automation:

- Prefer PATs/API keys for long-lived automation.
- PATs sent as `Authorization: Bearer <pat>`.
- OAuth-based CLIs can also use access+refresh tokens stored in local OS keychains.

Service-to-service:

- Use OAuth 2.1 client credentials grant bound to a ServiceIdentity.
- Optionally support signed tokens or mTLS for specific internal flows.

5.3 Session UX and flows

Sign-in:

1) Frontend initiates sign-in via:
   - OIDC Sign in with Google, or
   - First-party email/password, or
   - First-party magic-link.
2) IdP (external or first-party) authenticates the user and returns identity claims or an assertion.
3) Backend exchanges or validates this and normalizes to VerifiedIdentity.
4) Auth-core:
   - Resolves VerifiedIdentity to an internal User (via UserIdentity and email-linking rules, plus tenant-specific linking policy).
   - Creates a new Session and initial refresh token.
   - Issues a short-lived access token (JWT) and sets transport-specific credentials (cookies, response body, etc.).
5) IdP session may persist for SSO; v1 APIs rely on auth-core sessions/tokens.

Sign-out:

- Revokes auth-core sessions/tokens.
- Optionally triggers IdP global logout as a UX choice.
- Access tokens already issued remain valid until expiry; for high-risk scenarios, additional denylisting mechanisms may be used.

Remember-me and idle timeout:

- "Remember me" toggles session TTL within a safe range (for example 24 hours vs 30 days).
- Idle timeout enforced via last_activity_at and refresh token usage.

5.4 Multi-tenant workspace selection

Workspace selection:

- Each request that needs workspace-level permissions must either:
  - Include X-Workspace-Id header, or
  - Rely on a default workspace_id if:
    - Token is scoped to a single workspace, or
    - User has a single workspace.

Backend resolves workspace and sets:

- current_setting('app.workspace_id')

Client ergonomics:

- Client SDKs should handle workspace selection automatically wherever possible:
  - For workspace-scoped PATs, the SDK can always send the correct workspace without the caller providing X-Workspace-Id manually.
  - For interactive clients, the SDK can manage "current workspace" state and header plumbing so most callers never touch the header directly.

Default workspace:

- For personal users, default workspace might be their personal workspace.
- For PATs:
  - If PAT is workspace-scoped, we use that workspace.
  - If PAT is user-scoped and user has multiple workspaces, require explicit header (ideally hidden behind client SDK ergonomics).

5.5 Service identities

Table service_identities:

- id
- name
- service_type (internal, external)
- allowed_workspaces (JSONB array or join table)
- client_id (for OAuth)
- created_at, updated_at, disabled_at

Credentials:

Table client_secrets:

- id
- service_identity_id
- hash_envelope or encrypted secret
- created_at, expires_at, revoked_at

Stored hashed using the same hash envelope pattern as other secrets, with a distinct key_id namespace and optional pepper.

- last4 stored for UX/auditing; raw secret only shown once on creation/rotation.
- Rotated per-client with created_at/expires_at/disabled_at on client_secrets rows; enforce single active secret unless migrating.
- Prefer private_key_jwt or mTLS for higher-sensitivity clients; symmetric secrets are a fallback for low-risk server-side apps.
- Require PKCE even for public clients; confidential clients must also authenticate with their configured method.

Relationship between service_identities and oauth_clients:

- For simplicity, adopt a 1:1 relationship:
  - Each ServiceIdentity has one primary OAuthClient for client_credentials.
  - client_id on service_identities references this oauth_clients row.

5.6 RLS & GUCs

We rely heavily on Postgres RLS + custom GUCs for isolation:

GUCs:

- app.user_id
- app.profile_id (when the domain model requires it)
- app.workspace_id
- app.mfa_level
- app.service_id (optional for service principals)

Pattern:

- Before each request:
  - Auth middleware validates token/PAT and constructs an AuthContext.
  - DB wrapper sets required GUCs via SET or SET LOCAL:
    - SET app.user_id = :userId::uuid
    - SET app.profile_id = :profileId::uuid (when profile-scoped)
    - SET app.workspace_id = :workspaceId::uuid
    - SET app.mfa_level = :mfaLevel
  - Only set profile_id when the request is tied to a profile; otherwise clear/unset it to avoid leakage between requests.

RLS policies:

- Expressed in terms of these GUCs.
- Example policy:

    CREATE POLICY tenant_isolation ON transactions
      USING (
        workspace_id = current_setting('app.workspace_id')::uuid
      );

Additional invariants:

- Some actions require elevated mfa_level:
  - RLS or check constraints can enforce that for certain tables.
- Some actions are only allowed for service principals:
  - Use current_setting('app.service_id') IS NOT NULL.

DB wrapper responsibilities:

- Ensures:
  - GUCs are set correctly per request, based on AuthContext.
  - Connections are reset or GUCs cleared between pooled uses to avoid leakage.

Error semantics:

- 401 – bad/missing credentials (invalid, expired, or revoked).
- 403 – authenticated but not authorized or not fully satisfied MFA requirements.
- 503 – cannot validate auth due to infra failure.

5.7 OAuth 2.1 authorization server

Core endpoints (end-state design):

- /oauth/authorize (authorization code with PKCE)
- /oauth/token (exchange code for tokens; refresh tokens; client credentials)
- /oauth/revoke (revoke access/refresh tokens)
- /oauth/introspect (optional, for resource servers)
- /openid/userinfo
- /.well-known/openid-configuration (implemented for v1)
- /.well-known/jwks.json (implemented for v1)

Supported grants:

- Authorization code with PKCE (for web/mobile/CLI)
- Refresh token grant
- Client credentials (for service-to-service)
- No implicit grant

Note: This represents the end-state authorization server. In v1, we have implemented all core endpoints including OIDC discovery (/.well-known/openid-configuration) and JWKS. Third-party OAuth clients, consent screens, and the oauth_grants table are deferred per section 5.17.

Clients

Table oauth_clients:

- id (client_id)
- client_name
- client_type (public or confidential)
- redirect_uris (JSONB or separate table)
- allowed_scopes
- allowed_grant_types
- token_endpoint_auth_method (none, client_secret_basic, etc.)
- created_at, updated_at, disabled_at

Registered first-party clients:

- Web app (single-page app with backend)
- Mobile/Capacitor app
- CLI (may use device flow in future)

Third-party clients:

- Later extension; for now likely limited to simple integrations.

Consent:

- For third-party OAuth clients:
  - Present a consent screen describing scopes in human language.
  - Persist grants in a table such as oauth_grants:
    - user_id, client_id, scopes, created_at, updated_at, revoked_at.

- On subsequent authorizations:
  - If requested scopes are a subset of existing granted scopes, consent may be skipped or reduced.
  - If requested scopes expand beyond existing grants, show an updated consent screen.

Key management:

- Use asymmetric keys (for example RS256/ES256).
- Include kid in JWT header.
- Maintain JWKS endpoint with active keys.

5.8 MFA & risk-based controls

MFA modeling:

- mfaLevel and mfaCompletedAt are stored on auth_sessions.
- When user completes MFA:
  - Update session.mfaLevel and mfaCompletedAt.

Mapping IdP MFA:

- For IdPs that provide AMR/ACR claims:
  - Map those claims to local mfaLevel values (none, mfa, phishing_resistant).
  - Avoid double-prompting when IdP has already enforced a strong second factor.

- If IdP MFA does not meet requirements for certain high-risk actions:
  - Require local MFA step-up even if IdP thinks MFA has been done.

High-risk actions:

- Connecting or modifying bank accounts.
- Creating or revoking PATs/API keys.
- Exporting financial data.
- Changing workspace ownership or admin roles.

Policy:

- For each high-risk endpoint:
  - Check that AuthContext.mfaLevel >= required level.
  - If not, return a 403 MFA-required error and instruct frontend to trigger MFA step-up.
  - 403 is used because the user is authenticated but needs additional factors.

5.9 Error semantics

- 401 Unauthorized:
  - Missing/invalid/expired/revoked credentials.

- 403 Forbidden:
  - Valid credentials but insufficient scopes, role, or MFA level.
  - Includes the case where MFA is required but not satisfied.

- 503 Service Unavailable:
  - Unable to validate auth due to infra failure (DB/cache issues).
  - We never fall back to trusting JWT claims alone in this situation.

5.10 Rate limiting

Auth-focused endpoints should be aggressively rate-limited:

- Per IP:
  - Login attempts.
  - Token grant/refresh.

- Per user:
  - Failed login attempts.

- Per client_id:
  - Misbehaving OAuth clients.

Implementation:

- Shared rate-limiting middleware (Redis, in-memory for dev).
- Separate buckets for:
  - /login, /oauth/authorize, /oauth/token, /oauth/revoke, /oauth/introspect.
- Stronger limits on password/MFA endpoints if we host them.

5.11 Logging & auditing

Security events:

Table security_events (or equivalent stream):

- id
- user_id (optional)
- workspace_id (optional)
- service_id (optional)
- event_type:
  - login_success, login_failed, mfa_challenge, mfa_failed, mfa_success
  - refresh_token_reuse_detected, pat_created, pat_revoked, etc.
- ip_address, user_agent
- created_at
- metadata (JSONB)

Audit logs:

- For bank/financial operations, consider a separate immutable event log.
- Retention and access to logs must be designed with privacy in mind.

Alerting:

- High-severity events (for example confirmed refresh token theft, suspicious login patterns) can trigger alerts.

5.12 Tenant & workspace isolation

RLS invariants:

- Every tenant-scoped table includes a workspace_id.
- RLS ensures that only rows with workspace_id = current_setting('app.workspace_id')::uuid are visible.
- No table includes cross-tenant joins without explicit authorization checks.

Global tables:

- Some tables are global (for example users, oauth_clients, service_identities).
- Access to these is restricted by role and is mostly for system admins and auth-core itself.

Workspace membership resolution:

- On each request:
  - Validate token.
  - Resolve workspace via header or default.
  - Load membership row (or from cache).
  - Populate AuthContext with workspace_id, membership_id, roles, and derived scopes.

- If no membership exists for the requested workspace:
  - Return 403.

Shared workspaces:

- For now, we treat shared workspaces as normal workspaces with multiple memberships.

5.13 Admin & support access

Admin roles:

- global_admin or similar:
  - Stored in a separate roles table or configuration.
  - Grants access to admin APIs; does not bypass RLS by default.

Support tools:

- Prefer building dedicated admin routes that:
  - Use separate DB connections with distinct GUCs.
  - Require explicit logging of actions (who did what, when, why).

Impersonation (future):

- If needed:
  - "Login as user" would use a special session that:
    - Keeps track of the original admin.
    - Logs all actions.
  - Must be restricted by policy and hardware keys for admins.

5.14 Backwards compatibility & migrations

Token evolution:

- We may need to:
  - Change token structure or fields.
  - Add new algorithms or keys.

Strategy:

- Use a kid header and JWKS for JWT keys.
- For opaque tokens:
  - Use versioned prefixes (rt1_, rt2_, etc.) if format changes.
- Support both old and new formats during migration window.

User identity migrations:

- When changing IdPs or adding new identity providers:
  - Keep existing user_id stable.
  - Use mapping from old IdP subjects to new ones.
  - Avoid resetting sessions where possible; use silent re-auth.

Workspace & role migrations:

- Changes to role semantics must be additive where possible:
  - Introduce new roles or scopes without breaking existing clients.
  - For destructive changes, use multi-step migrations and feature flags.

Backwards-compatible changes:

- Prefer additive changes to AuthContext, scopes, and token schemas.
- Version OIDC endpoints or client configs if sub or other core semantics ever change.

5.15 Future work / open questions

- How to refine migration and edge cases for pairwise subject identifiers in OIDC (third-party clients will use pairwise subs when introduced).
- Whether to add explicit device identifiers to sessions for sign-in alerts.
- Which additional IdP factors (for example passkeys, hardware keys) to support and how to encode them in mfaLevel.
- When to implement device authorization flow (if needed for TVs/headless CLIs).
- Additional admin tooling for:
  - Bulk revocation.
  - Security incident response.
  - Auditing service identity usage.
- When to introduce more sophisticated refresh reuse heuristics beyond the v1 first-incident benign-race rule.
- When to introduce sid/jti-based denylist for near-real-time access token revocation.

5.16 GUC & connection-pool hygiene

To avoid subtle RLS and tenancy bugs:

- All DB access must go through middleware/DB wrapper that:
  - Sets app.user_id, app.workspace_id, app.mfa_level from the AuthContext at the start of a request.
  - Resets or clears these GUCs before releasing a connection back to the pool.
  - Never forget to clear app.user_id or app.workspace_id when returning a connection.

- For long-lived workers using pooled connections:
  - Ensure per-job setup and teardown of GUCs.
  - Never run background jobs that inherit GUCs from a previous request because of how the pool is used.

- For pgbouncer or similar:
  - Prefer transaction pooling for app workloads, with explicit BEGIN/COMMIT around request-level work.
  - Ensure GUCs are set within the transaction scope and not relied on across transactions.

5.17 Recommended v1 simplifications (opinionated)

To keep initial implementation tractable and safe:

Scopes and roles:

- Start with a very small, coarse set of scopes:
  - read:accounts, write:accounts, read:transactions, write:transactions, manage:members, admin.
- Map a small set of roles (owner, admin, member, viewer) to these scopes via configuration.
- Introduce scope aliases early so you can evolve scopes later without breaking existing tokens.

IdPs:

- V1/MVP includes:
  - First-party email/password authentication (with modern password hashing such as Argon2 or bcrypt).
  - Email-based magic-link login for passwordless sign-in.
  - Sign in with Google via OIDC.
- All of these are normalized into VerifiedIdentity by auth-core.
- Implement tenant-specific linking policy but keep it simple (for example allow email linking only for selected domains or verified domains).
- Add SAML/enterprise providers later without changing core semantics.

Refresh reuse heuristics:

- V1: use the first-incident benign-race rule:
  - First reuse in a short window and same IP/UA ⇒ treat as benign race; return 401 invalid refresh, log low-severity event, and do not revoke family.
- Add nuanced IP/UA/timing-based heuristics once telemetry is available.

Service identities:

- Start with per-workspace service identities, or very small allowlists.
- If allowed_workspaces contains more than one workspace, require explicit workspace header and never default.

High-risk cache policy:

- In v1, always hit DB (no cache) for a small set of high-risk actions (transfers, bank connections, PAT management, workspace deletion).
- Introduce more nuanced cache behavior later as needed.

OAuth/OIDC:

- For a long while, treat the system as first-party web plus maybe first-party CLI and mobile clients only.
- Use PATs as the primary external integration surface for users building on top of the API from day one.
- Defer third-party OAuth/OIDC entirely — clients, consent screens, and oauth_grants — until there is clear demand.
- When expanding beyond v1, be explicit about which additional endpoints and grants from 5.7 are being turned on and why.

MFA:

- Start with TOTP-based MFA or IdP-provided MFA.
- Add WebAuthn/passkeys later for phishing-resistant flows.

PATs / API access:

- Ensure v1 includes:
  - A minimal UI and API to create, list, and revoke PATs.
  - PATs that are workspace-scoped by default for safety.
  - Documentation explaining how to use PATs to access user-created views and data.

Operationalization:

- Build small, focused admin views:
  - Session lists per user.
  - PATs per user/workspace.
  - Service identities and their keys.
- Add observability:
  - Dashboards for auth errors, token issuance, refresh flows, and rate limits.

--------------------------------------------------
6. SUMMARY
--------------------------------------------------

This plan provides:

- A clear separation between identity (IdP), auth core, and application.
- Strong multi-tenant isolation via Postgres RLS and GUCs.
- A unified token and key management story, with:
  - JWT access tokens.
  - Opaque, hash-enveloped refresh tokens and PATs.
- Well-defined AuthContext that all services can rely on, with a single principalType axis rather than multiple overlapping identity flags.
- A v1/MVP that includes:
  - Email/password sign-in.
  - Magic-link sign-in.
  - Sign in with Google.
  - PAT-based access as the primary external integration surface from day one.
- Centralized security defaults (TTLs, timeouts, MFA expectations) to reduce configuration drift between sections.
- A path from a focused v1 (first-party + PAT-based integration) to a more full-featured OAuth/OIDC platform as the product grows, with client ergonomics (especially around workspace selection) handled primarily by SDKs rather than raw headers in app code.

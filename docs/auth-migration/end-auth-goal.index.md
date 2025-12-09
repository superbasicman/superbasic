# Auth Architecture Index (end-auth-goal.md)

Use this as a router before opening `docs/auth-migration/end-auth-goal.md`. Line numbers are approximate; jump to the matching section in the full doc.

- 0. Threat model & non-goals (lines 15–55): read when assessing risks, scope boundaries, or explicit non-goals.
- 1. High-level architecture (56–110): read when aligning components/flows across IdPs, auth-core, and the app API.
- 2.1 Users and identities (114–168): read when changing user/identity tables, IdP mapping, or email uniqueness/reuse.
- 2.2 AuthContext (169–220): read when adjusting context propagation, scopes/roles, or service principal semantics.
- 2.3 Workspaces & memberships (221–254): read when mapping auth context to tenants/workspaces or defaults.
- 3.1 Token taxonomy (255–285): read when choosing token types (access, refresh, PAT, service) and their boundaries.
- 3.2 Canonical token format & hash envelopes (286–342): read when storing/validating tokens or hashing envelopes.
- 3.3 Sessions and refresh tokens (343–410): read for session lifecycle, rotation, and reuse detection.
- 3.4 Personal Access Tokens (PATs) / API keys (411–447): read when designing PAT issuance/limitations.
- 3.5 Access tokens (448–492): read for JWT claims, expiry, and validation paths.
- 3.6 OIDC id_tokens (493–528): read for OIDC compatibility and id_token fields.
- 3.7 Default security parameters (529–562): read for TTLs, rotation windows, and baseline defaults.
- 4. Core invariants (563–586): read to check non-negotiable rules before shipping changes.
- 5.1 Transport & storage (590–602): read for cookie/storage guidance across clients.
- 5.2 Client platforms (603–634): read for platform-specific handling (web, mobile, CLI).
- 5.3 Session UX and flows (635–661): read for login/refresh UX sequencing.
- 5.4 Multi-tenant workspace selection (662–688): read when deciding workspace selection rules.
- 5.5 Service identities (689–721): read for service principal setup and scoping.
- 5.6 RLS & GUCs (722–770): read to wire auth context to Postgres GUCs/RLS.
- 5.7 OAuth 2.1 authorization server (771–831): read when touching authorization/token endpoints.
- 5.8 MFA & risk-based controls (832–862): read for MFA/risk policies.
- 5.9 Error semantics (863–875): read to align error responses and codes.
- 5.10 Rate limiting (876–896): read when adding/modifying rate limits for auth endpoints.
- 5.11 Logging & auditing (897–922): read for audit/logging expectations.
- 5.12 Tenant & workspace isolation (923–950): read to validate cross-tenant safety.
- 5.13 Admin & support access (951–972): read for elevated access flows.
- 5.14 Backwards compatibility & migrations (973–1005): read when migrating from current auth to target.
- 5.15 Future work / open questions (1006–1018): read to understand open decisions.
- 5.16 GUC & connection-pool hygiene (1019–1035): read for DB connection configuration concerns.
- 5.17 Recommended v1 simplifications (1036–1101): read to scope down initial delivery.
- 6. Summary (1102+): skim for quick recap when cross-checking alignment.

# Phase 9 – Advanced MFA, Step-Up Auth, Enterprise SSO

Context to review:
- `docs/auth-migration/auth-migrate-phases.md` (Phase 9 section)
- `docs/auth-migration/end-auth-goal.md`
- `agent/agents.md`
- IdP capabilities for MFA (TOTP, WebAuthn/passkeys, SMS/email) and SSO (SAML/OIDC) in current stack
- Existing auth/session services for `AuthContext.mfaLevel` + recent-auth checks

- [x] 1. MFA foundations (in progress)
  - Add IdP-backed MFA options (TOTP and WebAuthn/passkeys; SMS/email if required) and enrollment/recovery UX.
  - Persist `session.mfaLevel` and `AuthContext.mfaLevel`, propagate through middleware, tokens, and RLS checks.
  - Sanity check: MFA enrollment flows are auditable; recovery codes/backup methods are issued and can be rotated/revoked.
  - Note: MFA is enforced at the IdP; auth-core records assurance level and must not rely on client-asserted claims.
  - Note: When persisting `AuthContext.mfaLevel`, also set `app.mfa_level` (and related GUCs) per request/session so RLS can enforce assurance levels.
  - Deliverables: enrollment/verification flows for TOTP + WebAuthn, backup codes (hashed, shown once, regenerate/revoke), per-factor revoke/reset, audit events for enroll/verify/challenge/recovery (success/failure), and session/token stamping of `mfaLevel` on issuance/refresh.

- [x] 2. Step-up / re-auth flows
  - Implement step-up for sensitive actions (e.g., bank linking, credential changes, member management) with short-lived higher-assurance tokens or recent-auth flags.
  - Add service-level guards that enforce `mfaLevel` and `recentlyAuthenticatedAt` thresholds; expose UI prompts to trigger step-up.
  - Sanity check: protected actions fail without recent strong auth; success updates audit logs with action + assurance level.
  - Note: enforce a concrete recent-auth window (e.g., 5–15 minutes) per action; do not trust client timestamps.

- [ ] 3. Enterprise SSO integration
  - Add SAML/OIDC IdP implementations (e.g., `provider = 'saml:<id>'`, `provider = 'auth0:<connection>'`) and workspace/tenant binding rules.
  - Handle back-channel logout to revoke sessions/tokens for affected users; ensure login hints map to existing users safely.
  - Sanity check: SSO users can log in and honor RLS/ownership semantics; logout and revocation paths work for SSO sessions.

- [ ] 4. Admin & audit updates
  - Extend audit/logging for MFA enrollment/verification, step-up assertions, SSO logins/logouts, and back-channel events.
  - Add support runbooks for account recovery, MFA reset, and SSO troubleshooting; ensure secret material is redacted.
  - Sanity check: audit trails capture actor, assurance level, IdP source, and affected resources without leaking secrets.

- [ ] 5. Docs & validation
  - Update auth docs with MFA options, step-up flows, and SSO configuration/setup paths.
  - Run: `pnpm --filter @repo/api typecheck`, `pnpm --filter @repo/web typecheck && pnpm --filter @repo/web build`, and relevant MFA/SSO/step-up tests (unit/e2e).
  - Sanity check: builds/tests pass; documentation shows enrollment, recovery, step-up, and SSO use cases end to end.

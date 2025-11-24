# SSO Troubleshooting Runbook

## Scope

Debug SAML/OIDC/Auth0 SSO login failures, workspace binding issues, and back-channel logout anomalies.

## Quick Checks

- Is the IdP connection enabled and reachable? (metadata URL / discovery).
- Are `provider` identifiers consistent (`saml:<id>`, `oidc:<id>`, `auth0:<connection>`)?
- Are email domains allowed for the binding (when configured)?
- Does the IdP send a stable `NameID`/`sub` for `providerUserId`?

## Login Failures

1) **Bad provider mapping**
   - Symptom: 202/no-op or new account created unexpectedly.
   - Check: IdP config matches `WorkspaceSsoBinding.provider`.
   - Fix: Align provider identifiers; retry login.

2) **Email mismatch**
   - Symptom: Invite-only binding rejects login.
   - Check: `allowedEmailDomains` and `emailVerified` flags.
   - Fix: Verify email at IdP; adjust domain allowlist if intended.

3) **Workspace binding missing**
   - Symptom: Login succeeds but no workspace access.
   - Check: Workspace binding exists for provider; membership present.
   - Fix: Add binding or invite user to workspace.

## Back-Channel Logout Issues

- Endpoint: `POST /v1/auth/sso/logout`
- Checklist:
  - Payload contains `provider`, `providerUserId`, optional `sessionIds`.
  - `user_identities` row exists for the pair.
  - Sessions exist and are not already revoked.
  - Logs show `session.revoked` with `reason=sso_backchannel_logout`.
- Recovery: retry same payload (idempotent) or revoke sessions manually via admin tooling.

## Logging & Observability

- Audit logs: look for `user.sso.login` / `user.sso.logout` events with `provider`, `workspaceId`, `sessionId`.
- Metrics: rate/latency of `/v1/auth/sso/logout`; SSO login success vs failure count.
- Enable temporary debug logging around SSO callbacks if needed (ensure secrets are redacted).

## Data to Collect

- Timestamp, requestId, provider + providerUserId
- Sample assertion/ID token (redacted of signatures/secrets)
- User email and workspace ID expected
- Relevant log excerpts (`user.sso.*`, `session.revoked`)

## Escalation

- If IdP metadata/keys changed: rotate metadata and re-validate signature.
- If persistent mapping errors: coordinate with IdP owner to align subject/claims.
- If widespread failures: temporarily disable SSO binding to prevent partial logins.

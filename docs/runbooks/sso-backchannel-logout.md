# SSO Back-Channel Logout Runbook

## Purpose

Handle IdP-initiated logout (SAML/OIDC/Auth0) so user sessions and refresh tokens are revoked promptly and safely.

## Endpoint

- `POST /v1/auth/sso/logout`
  - Body: `{ provider, providerUserId, sessionIds? }`
  - Rate-limited alongside other auth endpoints.
  - Idempotent: returns 202 even if nothing to revoke.

## Flow

1) Normalize request → `provider`, `providerUserId`, optional `sessionIds`.
2) Lookup `user_identities` for the provider/user ID.
3) Fetch active sessions for matching users.
4) Compute revocation plan with `planBackChannelLogout` (auth-core).
5) For each planned session:
   - Revoke session (`revokedAt`) and any active refresh tokens.
   - Emit `session.revoked` auth event with reason `sso_backchannel_logout`.
6) Respond 202 regardless of whether sessions were found.

## Validation & Safety

- Providers are namespaced (`saml:<id>`, `oidc:<id>`, `auth0:<connection>`); invalid providers return 202 to avoid leaking existence.
- Session IDs supplied by IdP are validated as strings; unknown IDs are ignored.
- Revocation is scoped to the owning user; cross-tenant revocation is prevented by user-session match.

## Monitoring & Alerting

- Track count and latency of `/v1/auth/sso/logout`.
- Alert on repeated failures or spikes where `sessionIds` are non-empty but no sessions revoked (may indicate mapping drift).
- Log structured events with `provider`, `providerUserId`, `sessionIds.length`, `revokedCount`.

## Recovery Steps

- If revocation fails:
  - Retry the same payload (idempotent).
  - Manually revoke sessions via admin tooling using `sessionIds` or affected `userId`s.
- If IdP sends malformed payloads:
  - Validate IdP configuration (NameID/subject mapping).
  - Enable additional logging temporarily to capture offending payloads (ensure secrets are redacted).

## Test Checklist

- ✅ Callback with known `(provider, providerUserId)` revokes all active sessions for that identity.
- ✅ Callback with explicit `sessionIds` revokes those sessions when owned by the identity’s user.
- ✅ Callback with unknown identity responds 202 and makes no changes.
- ✅ Callback with mixed known/unknown `sessionIds` only revokes the known owned sessions.
- ✅ Rate-limit respected; repeated callbacks do not error or double-revoke.

# Account Recovery & MFA Reset Runbook

## Scope

Guide for support/oncall to help users regain access when locked out (lost device, lost recovery codes, SSO issues) while minimizing abuse risk.

## Principles

- Verify identity with multiple signals; never bypass controls without evidence.
- Prefer revoking old factors and issuing new recovery codes rather than disabling MFA entirely.
- Log every action (who, when, what evidence, which user).

## Verification Checklist

1) Confirm request authenticity:
   - Request came through known support channel.
   - Correlate email/domain with account record.
2) Collect evidence (at least two):
   - Recent successful login IP/UA match (from logs).
   - Ownership proof: billing details (last 4), workspace role confirmation, recent activity specifics.
   - For SSO: IdP admin confirmation or valid enterprise email challenge.
3) Record requestId/ticket ID for audit.

## Recovery Steps

**If user still has one valid factor (e.g., backup code)**
- Guide user to self-serve MFA reset by adding a new factor, then revoke old factor.
- Issue new recovery codes; instruct user to store securely.

**If all factors lost**
- After verification, perform admin-driven reset:
  - Revoke all sessions and refresh tokens for the user.
  - Revoke existing MFA factors (mark as disabled).
  - Generate and deliver new one-time recovery codes (out-of-band).
  - Require re-enrollment on next login.

**For SSO users**
- Verify with IdP admin or enterprise email challenge.
- Ensure `user_identities` mapping is intact; if not, re-link after confirmation.

## Post-Action Logging

- Emit/support audit event with:
  - `userId`, actor (staff/oncall), action (`mfa_reset`/`account_recovery`), evidence summary, requestId/ticket.
- Ensure `session.revoked` and `user.mfa_*` events are visible in logs.

## Safety Checks

- Do not share recovery codes over insecure channels; prefer secure ticket comments or verified email.
- Never change account email without separate verification.
- If suspicious, escalate instead of proceeding; freeze account (`user.status = locked`) until resolved.

## Testing / Validation

- Run through a dry-run in staging:
  - Create user with MFA, lose factors, perform admin reset, confirm login flow forces re-enrollment and old sessions are invalid.
  - Verify audit logs show reset, session revocations, and new MFA enrollment.

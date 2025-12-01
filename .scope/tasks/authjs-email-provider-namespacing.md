# Auth.js Email Provider Namespacing (authjs:email)

Objective: align Auth.js provider IDs by namespacing the magic-link/email provider to `authjs:email`. This repo has zero users, so no legacy aliasing or backfill is required. Remove any dead code if applicable.

## Scope
- Add an email provider constant and apply it to the Nodemailer provider.
- Update Auth.js callbacks to reference the constant (no raw `"email"` ids in logic).
- Refresh docs to list `authjs:email` alongside other Auth.js providers.
- Keep only live code paths; no legacy normalization or data migrations.

## Non-Goals
- No provider aliasing for legacy values.
- No backfill of `accounts` or `user_identities`.

## Work Items
- [ ] 1. Add `AUTHJS_EMAIL_PROVIDER_ID = "authjs:email"` constant.
  - Sanity check: constant exported from `packages/auth/src/constants.ts`.
- [ ] 2. Apply the namespaced id to the Nodemailer provider.
  - Sanity check: `packages/auth/src/config.ts` sets Nodemailer `id` to the constant and reasserts it after creation (mirrors credentials/google).
- [ ] 3. Update email-specific conditionals to use the constant.
  - Sanity check: no remaining provider comparisons to the literal `"email"` in Auth.js callbacks; logic uses the constant.
- [ ] 4. Update docs to reflect the namespaced email provider.
  - Sanity check: provider lists/examples in auth docs include `authjs:email`.
- [ ] 5. Verify build/tests still pass for the auth package.
  - Sanity check: `pnpm --filter @repo/auth test -- --run` (or existing package test command) succeeds.

## Notes / Findings
- Previous findings (legacy provider normalization and missing backfill) are intentionally out of scope because there is no existing user data in this repo.

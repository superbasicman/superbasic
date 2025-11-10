# Security & Secrets Management

This doc captures the security guardrails and secret-handling rules for SuperBasic Finance.

## 1. Security & compliance expectations

- Enforce `Authorization: Bearer` on all `/v1` routes unless explicitly documented as public.
- Respect **Postgres RLS** on all multi-tenant tables:
  - RLS depends on `current_setting('app.user_id')`, `current_setting('app.profile_id')`, and `current_setting('app.workspace_id')`.
  - Do not add queries that assume cross-tenant visibility or bypass RLS.
- Log security-sensitive actions with enough context to audit:
  - API key create/revoke.
  - Workspace membership changes.
  - Billing changes and failed Stripe/Plaid webhooks.
- Avoid leaking internals:
  - Standardize error responses (code + message) without including stack traces.
  - Use structured logging (requestId, user/profile/workspace IDs, route, etc.) instead of dumping raw errors.

## 2. Secrets management

**Never** hardcode real secrets in code, scripts, or documentation.

- Use placeholders everywhere:
  - `PLAID_CLIENT_ID=your_client_id_here`
  - `STRIPE_SECRET_KEY=sk_test_your_key_here`
  - `RESEND_API_KEY=re_your_key_here`
- `.env.example`:
  - Only placeholder values.
  - No real keys, even in test or sandbox mode.
- Scripts:
  - Require secrets via environment variables.
  - Fail fast with a clear error if a required env var is missing.
- Documentation:
  - Show patterns, not real values. Example:
    - ✅ `RESEND_API_KEY=re_your_key pnpm tsx script.ts`
    - ❌ `RESEND_API_KEY=re_QCFJoGYk_real_key pnpm tsx script.ts`

## 3. Secret rotation

If a secret is ever exposed (for example, pasted in a doc or log):

1. Rotate the key in the provider (Stripe, Plaid, Resend, etc.).
2. Update `.env` and any CI secrets.
3. Replace any examples with placeholders.
4. Add a short note to the relevant ops/runbook doc describing what happened and the fix.

## 4. Browser vs server boundaries

- Never put Stripe, Plaid, or other provider secrets in `apps/web` or any code shipped to the browser.
- The browser should only ever receive:
  - Public keys/tokens intended for client-side use.
  - Temporary tokens that are safe to expose (e.g., Plaid Link token).
- All sensitive exchanges (token swaps, secret-key calls) must go through **server-side** routes in `apps/api`.

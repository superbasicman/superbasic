# Security & Secrets Management

## Security & Compliance

- Enforce `Authorization: Bearer` for every `/v1` route; intentionally whitelist any public route.
- Implement Postgres row-level security for multi-tenant tables using session variables and Prisma transactions.
- Log sensitive actions (key create/revoke, billing updates, Plaid sync failures) to the audit trail with request IDs.

## Secrets Management in Documentation & Scripts

- **NEVER hardcode actual API keys, tokens, or secrets** in `.md` files, scripts, or code examples.
- **Always use placeholders** in documentation: `re_your_api_key_here`, `sk_test_xxxxx`, `your_secret_here`.
- **Scripts must require environment variables** – no fallback to hardcoded values for sensitive data.
- **Test scripts should fail fast** with clear error messages if required env vars are missing.
- **Example files** (`.env.example`) should only contain placeholder values, never real secrets.
- **Documentation examples** should show how to pass env vars, not actual values:

```bash
# ✅ Good - shows pattern
RESEND_API_KEY=re_your_key pnpm tsx script.ts

# ❌ Bad - exposes actual key
RESEND_API_KEY=re_QCFJoGYk_xxx pnpm tsx script.ts
```

- **If a secret is accidentally committed**, rotate it immediately and update all references to use placeholders.
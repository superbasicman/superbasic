## @repo/auth

This package provides shared auth utilities (password hashing, token hashing/envelopes, PAT helpers, RBAC scopes). Auth.js adapters are no longer used; auth-core owns authentication flows.

### Rebuilding after local changes

The API and PWA import from the compiled `dist/` bundle. Whenever you edit any source under `packages/auth/src`, run:

```bash
pnpm --filter @repo/auth build
```

This runs `tsup` to regenerate `dist/index.js`/`index.cjs`. Restart any dependent dev servers afterwards so they pick up the new bundle.

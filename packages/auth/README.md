## @repo/auth

This package houses the Auth.js configuration, adapters, and helpers shared across the monorepo.

### Rebuilding after local changes

The API and PWA import from the compiled `dist/` bundle. Whenever you edit any source under `packages/auth/src`, run:

```bash
pnpm --filter @repo/auth build
```

This runs `tsup` to regenerate `dist/index.js`/`index.cjs`. Restart any dependent dev servers afterwards so they pick up the new bundle.

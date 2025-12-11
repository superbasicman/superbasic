## @repo/auth

This package provides shared auth primitives (password hashing, constants, cookie name, session schema). All higher-order auth flows live in `@repo/auth-core`; no Auth.js adapters are used in this repo.

### Rebuilding after local changes

The API and PWA import from the compiled `dist/` bundle. Whenever you edit any source under `packages/auth/src`, run:

```bash
pnpm --filter @repo/auth build
```

This runs `tsup` to regenerate `dist/index.js`/`index.cjs`. Restart any dependent dev servers afterwards so they pick up the new bundle.

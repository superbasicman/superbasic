# Vercel esbuild Version Conflict Fix - 2025-10-27

## Problem

After successfully deploying the web app to Vercel, redeploying the API (to update `WEB_APP_URL` environment variable) failed with:

```
Error: Expected "0.25.11" but got "0.21.5"
```

This occurred during the `esbuild` postinstall script.

## Root Cause

The monorepo had multiple versions of `tsup` across packages:
- Root: `tsup@8.3.0`
- Most packages: `tsup@8.0.0`
- Some packages: `tsup@8.0.1`

Each `tsup` version depends on a different `esbuild` version, causing conflicts:
- `tsup@8.3.0` → `esbuild@0.25.11`
- `tsup@8.0.0` → `esbuild@0.21.5`

When Vercel's build cache was invalidated (by redeploying), pnpm tried to install both versions, and esbuild's postinstall script detected the mismatch.

## Solution

Added a pnpm override to force a single esbuild version across the entire monorepo:

```json
{
  "pnpm": {
    "overrides": {
      "esbuild": "^0.21.5"
    }
  }
}
```

This tells pnpm to use `esbuild@0.21.5` for all packages, regardless of what version their dependencies request.

## Implementation Steps

1. Added override to root `package.json`
2. Ran `pnpm install` to regenerate lockfile
3. Verified only one esbuild version in `pnpm-lock.yaml`
4. Tested local build: `pnpm build --filter=@repo/api` ✅
5. Committed and pushed changes
6. Vercel automatically redeployed successfully

## Files Changed

- `package.json` - Added pnpm.overrides section
- `pnpm-lock.yaml` - Regenerated with single esbuild version

## Verification

```bash
# Check esbuild version in lockfile
grep "esbuild@" pnpm-lock.yaml | head -5

# Output (only one version):
# esbuild@0.21.5:
# bundle-require@5.1.0(esbuild@0.21.5):
# esbuild@0.21.5:
```

## Documentation Updated

Added troubleshooting section to `docs/vercel-deployment-guide.md`:
- "Build Fails with esbuild Version Mismatch"
- Includes error example, solution, and commands

## Why This Happened

This is a common issue in monorepos with:
1. Multiple packages using build tools (tsup, vite, etc.)
2. Different versions of those tools across packages
3. Build tools that depend on native binaries (esbuild)
4. Vercel's build cache invalidation exposing the conflict

## Prevention

Going forward:
- Keep `tsup` versions consistent across all packages
- Use workspace protocol for shared dev dependencies
- Consider moving `tsup` to root devDependencies
- Test full builds after dependency updates

## Status

✅ **Fixed and Deployed**
- API redeploy successful
- Web app working correctly
- Both apps communicating properly
- Documentation updated

---

**Resolution Time**: ~10 minutes
**Impact**: Blocked API redeployment temporarily
**Severity**: Medium (prevented deployment but easy fix)

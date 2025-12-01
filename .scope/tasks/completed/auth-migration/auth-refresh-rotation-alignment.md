# Refresh Token Rotation Alignment

**Priority:** HIGH  
**Status:** TODO  
**Created:** 2025-12-03

## Context

- Fresh repo with 0 users; no legacy compatibility required. Remove dead/legacy refresh code as part of the alignment.
- Task #2 in `.scope/tasks/further-auth-alignments.md` is only partially implemented.
- Refresh tokens are issued/rotated in the API, but `AuthCoreService.createSession` does not mint refresh tokens, and `/v1/auth/refresh` starts a new family on every rotation (breaks reuse-detection invariant).
- We need a single, AuthCore-owned path for issuing refresh tokens that preserves `familyId` across rotations.

## Tasks

- [x] 1. Preserve familyId on rotation
  - Sanity check: `/v1/auth/refresh` passes the prior token’s `familyId` into issuance; new refresh token row keeps the same `family_id`.

- [x] 2. Expose refresh issuance from AuthCore
  - Sanity check: `AuthCoreService` (or a helper it owns) provides `issueRefreshToken` and is used by API/login/Auth.js callback paths instead of ad hoc calls.

- [x] 3. (Optional) Mint refresh token during session creation
  - Sanity check: `createSession` can mint a refresh token (or a documented helper alongside it) so callers don’t need to duplicate refresh issuance logic.

- [x] 4. Tests cover rotation + family reuse
  - Sanity check: Integration test asserts familyId stays stable across rotation and reuse detection still fires; `pnpm --filter @repo/api test auth-refresh.test.ts --run` passes.

## Validation

After completion, refresh tokens stay in the same family across rotations, issuance is centralized under AuthCore, and tests pass demonstrating the invariant.

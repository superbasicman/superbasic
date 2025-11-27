## Fix-Errors Game Plan (PAT/Auth-Core)

Context: After completing Task 3 in `.scope/tasks/pat-auth-core-migration.md`, PAT-related tests are still failing (scope mismatches and admin PAT 403). Must align with `docs/auth-migration/end-auth-goal.md`: auth-core owns scope computation; API should trust it and avoid re-deriving scopes.

### What we’ve seen
- PAT middleware test: expected empty `tokenScopes` but got `['read:transactions']` (effective scopes mismatch).
- Admin PAT in scopes test returns 403 instead of 200 (admin scope not honored).
- Mocks (`VITEST_MOCK_DATABASE`) likely missing realistic user/email/profile/workspace membership and token scopes, causing auth-core to compute different scopes.
- Middleware has been overriding/merging scopes, diverging from auth-core output.

### Recommended approach (stay the course, add targeted debug)
1) **Inspect current data flow**
   - Add temporary debug logs (guarded by `VITEST_DEBUG_PAT`) in `patMiddleware` to log `auth.scopes`, `tokenScopesRaw`, `workspaceId`, `userEmail`, `tokenId`.
   - In failing PAT/scopes tests, log response JSON when assertions fail to see actual values quickly.

2) **Align middleware with auth-core**
   - Set `auth` on context to the auth-core result unchanged; `tokenScopes` should mirror `auth.scopes`; `tokenScopesRaw` should come from the token record or fall back to `auth.scopes`.
   - Remove any fallback that replaces `auth.scopes` with raw token scopes.

3) **Tighten test fixtures/mocks**
   - In `vitest.setup.ts` mock Prisma, ensure:
     - `token.scopes` stored as `PermissionScope[]`.
     - user records include `email`; profile exists for the user.
     - workspace membership returns a valid role for scoped PATs.
   - In `createPersonalAccessToken`, seed the mocked Prisma (when used) with user/email/profile/workspace membership before issuing PATs, so auth-core resolves context.
   - Update PAT test expectations to reflect auth-core semantics: effective scopes come from auth-core; raw scopes in `tokenScopesRaw` only.

4) **Verify admin scope path**
   - For admin PAT test, confirm (via logs) `auth.scopes` contains `admin` after verification; if not, adjust mock membership/role/scopes handling to preserve `admin` as a scope.

5) **Cleanup**
   - After tests are green, remove temporary logs; keep middleware minimal and aligned with end-auth goal (API trusts auth-core, no extra scope derivation).

### Next steps
- Implement the logging/middleware/mocks tweaks per steps above, rerun PAT and scopes tests, and then full deploy-check.

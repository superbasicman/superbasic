# SuperBasic Finance - Remaining Work

**Last Updated:** 2025-12-03
**Context:** OAuth 2.1 finalization and auth migration completed. Database schema migrated successfully.

## 🎯 Current Status

- ✅ Database migration complete (all 11 migrations applied)
- ✅ Core package tests passing (87/87)
- ⚠️ API package tests: 154/188 passing (33 failures)

---

## 🔴 High Priority - Fix Failing Tests

### Auth Session & Identity Tests (33 failures)

The remaining API test failures are concentrated in auth-related functionality. These need investigation and fixes:

**Affected Test Files:**
- `src/middleware/__tests__/auth-unified.test.ts`
- `src/middleware/__tests__/scopes.test.ts`
- `src/routes/v1/__tests__/auth-session.test.ts`
- `src/routes/v1/__tests__/auth-refresh.test.ts`
- `src/routes/v1/__tests__/me.test.ts`
- `src/routes/v1/__tests__/register.test.ts`
- `src/routes/v1/oauth/__tests__/authorize.test.ts`
- `src/routes/v1/oauth/__tests__/token.test.ts`
- `src/routes/v1/tokens/__tests__/*.test.ts`

**Common Issues:**
- Auth session creation/validation
- Identity linking (ensureIdentityLink failures)
- Profile context propagation
- Workspace membership resolution

**Action Items:**
1. [ ] Run individual test files to isolate specific failures
2. [ ] Check if tests need updates for new schema (userId vs profileId)
3. [ ] Verify `ensureIdentityLink` in auth-core service works with new schema
4. [ ] Update test helpers if needed for new workspace membership model
5. [ ] Ensure all test files have `vi.unmock('@repo/database')` if they're integration tests

---

## 🟡 Medium Priority - Code Cleanup

### Remove Debug Code
- [ ] Remove debug logging from `packages/core/vitest.config.ts` (if any remains)
- [ ] Verify no console.log statements in production code

### Migration File Cleanup
- [ ] Review all migration files for consistency
- [ ] Ensure migration naming follows convention
- [ ] Add comments to complex migrations explaining what they do

### Type Safety Improvements
- [ ] Fix `as any` type assertions in `packages/auth-core/src/service.ts` (lines 269, 452)
- [ ] Fix `as any` in test files (`__tests__/token-service.test.ts`, `__tests__/auth-service.test.ts`)

---

## 🟢 Low Priority - Nice to Have

### Documentation
- [ ] Update API authentication docs to reflect OAuth 2.1 only (no magic link)
- [ ] Document the new workspace membership model
- [ ] Add migration guide for any future schema changes
- [ ] Update CLAUDE.md with final auth architecture details

### Test Coverage
- [ ] Add tests for orphaned trigger cleanup (ensure no legacy profile_id references)
- [ ] Add integration tests for full OAuth flow end-to-end
- [ ] Test workspace-scoped token creation and validation

### Performance
- [ ] Review Prisma query performance with new schema
- [ ] Check if any missing indexes are needed
- [ ] Profile token creation/validation paths

---

## 🔧 Technical Debt

### Schema Naming
- [ ] Fix typo: `parimary_email` → `primary_email` (requires migration)
  - Current: Column is `parimary_email`, mapped to Prisma field `primaryEmail`
  - This works but is confusing for raw SQL queries
  - Low priority unless doing a schema cleanup pass

### Test Database Mocking
- [ ] Review `apps/api/vitest.setup.ts` mock implementation
- [ ] Ensure mock apiKey methods have proper implementations when VITEST_MOCK_DATABASE is set
- [ ] Consider splitting integration vs unit test configurations more clearly

### Build Warnings
- [ ] Fix: "no output files found for task @repo/api#build" in turbo.json
- [ ] Address Biome lint warnings in auth-core package (4 warnings)

---

## 📋 Next Steps (Recommended Order)

1. **Fix API Test Failures** (1-2 hours)
   - Start with auth-session tests
   - Work through identity linking issues
   - Update any test helpers that reference old schema

2. **Verify Full OAuth Flow** (30 mins)
   - Manually test authorization code flow
   - Test refresh token rotation
   - Test PAT creation and usage

3. **Code Cleanup** (30 mins)
   - Remove debug code
   - Fix type assertions
   - Clean up migrations

4. **Documentation Update** (1 hour)
   - Update auth docs
   - Document new patterns
   - Add troubleshooting guide

---

## 🎓 Lessons Learned

### Migration Challenges Encountered

1. **Prisma Client Caching**
   - Issue: Generated client was stale after schema changes
   - Solution: `pnpm db:generate` after every schema change

2. **Environment Variable Loading**
   - Issue: Tests were connecting to wrong database (Neon cloud vs local test DB)
   - Solution: Prioritize .env.test files in vitest config, load them FIRST

3. **Vi.mock() Hoisting**
   - Issue: `vi.mock()` is hoisted even when inside `if` blocks
   - Solution: Explicitly call `vi.unmock('@repo/database')` in integration tests

4. **Migration Dependencies**
   - Issue: Migration referenced tables created in later migrations
   - Solution: Remove forward references, ensure migrations are self-contained

5. **Database Triggers**
   - Issue: Orphaned triggers referencing dropped columns caused cryptic errors
   - Solution: Always drop triggers/functions when dropping referenced columns

---

## 📞 Contact & Resources

- **Migration Docs:** `docs/oauth-mvp.md`, `docs/auth-migration/end-auth-goal.md`
- **Checklist:** `sectioned-auth-checklist.md`
- **Schema:** `packages/database/schema.prisma`
- **Test Setup:** `apps/api/src/test/setup.ts`, `apps/api/vitest.setup.ts`

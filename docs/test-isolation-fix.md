# Test Isolation Fix - Complete Success

**Date**: 2025-10-20  
**Issue**: 125 tests failing when run together, but passing individually  
**Root Cause**: Missing `vi.unmock('@repo/database')` in integration test files  
**Status**: ✅ FIXED - All 225 tests now passing

## Problem Summary

When running the full test suite with `pnpm --filter=@repo/api test`:
- **Before Fix**: 100 passed, 125 failed (225 total)
- **After Fix**: 225 passed, 0 failed (225 total)

The issue was that most integration test files were missing the `vi.unmock('@repo/database')` call, which meant they were using the mocked Prisma client instead of the real database connection.

## Root Cause

The Vitest setup (`apps/api/vitest.setup.ts`) conditionally mocks `@repo/database` based on the `VITEST_MOCK_DATABASE` environment variable:

```typescript
// vitest.setup.ts
if (shouldMockDatabase) {
  vi.mock('@repo/database', async () => {
    // ... mock implementation
  });
}
```

With `VITEST_MOCK_DATABASE=false` in `.env.test`, the mock should be disabled. However, **Vitest applies mocks before imports**, so test files that import from `@repo/database` (directly or indirectly through routes/middleware) would still get the mocked version unless they explicitly call `vi.unmock('@repo/database')`.

## The Fix

Added `vi.unmock('@repo/database')` to all integration test files that need real database access:

### Files Modified (12 total)

1. ✅ `apps/api/src/middleware/__tests__/pat.test.ts`
2. ✅ `apps/api/src/middleware/__tests__/auth-unified.test.ts`
3. ✅ `apps/api/src/middleware/__tests__/rate-limit-integration.test.ts`
4. ✅ `apps/api/src/test/infrastructure.test.ts`
5. ✅ `apps/api/src/routes/v1/__tests__/login.test.ts`
6. ✅ `apps/api/src/routes/v1/__tests__/logout.test.ts`
7. ✅ `apps/api/src/routes/v1/__tests__/me.test.ts`
8. ✅ `apps/api/src/routes/v1/__tests__/register.test.ts`
9. ✅ `apps/api/src/routes/v1/tokens/__tests__/create.test.ts`
10. ✅ `apps/api/src/routes/v1/tokens/__tests__/list.test.ts`
11. ✅ `apps/api/src/routes/v1/tokens/__tests__/revoke.test.ts`
12. ✅ `apps/api/src/routes/v1/tokens/__tests__/update.test.ts`

### Pattern Applied

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Unmock @repo/database for integration tests (use real Prisma client)
vi.unmock('@repo/database');

import app from '../../../app.js';
// ... rest of imports
```

**Key Point**: The `vi.unmock()` call must come BEFORE any imports that might use the database.

## Test Results

### Before Fix
```
Test Files  3 passed | 13 failed (16)
Tests       100 passed | 125 failed (225)
Duration    ~66 seconds
```

### After Fix
```
Test Files  16 passed (16)
Tests       225 passed (225)
Duration    ~170 seconds
```

### Test Breakdown

All test suites now passing:

1. ✅ Rate Limiting Tests (19 tests)
2. ✅ Auth Middleware Tests (20 tests)
3. ✅ Audit Logger Tests (11 tests)
4. ✅ Scope Enforcement Tests (13 tests) - **Task 12 deliverable**
5. ✅ Infrastructure Tests (5 tests)
6. ✅ Unified Auth Tests (15 tests)
7. ✅ PAT Middleware Tests (16 tests)
8. ✅ Rate Limit Integration Tests (9 tests)
9. ✅ Login Tests (19 tests)
10. ✅ Logout Tests (6 tests)
11. ✅ Me Endpoint Tests (12 tests)
12. ✅ Register Tests (18 tests)
13. ✅ Token Create Tests (21 tests)
14. ✅ Token List Tests (13 tests)
15. ✅ Token Revoke Tests (14 tests)
16. ✅ Token Update Tests (14 tests)

## Why This Happened

The scope enforcement tests (`scopes.test.ts`) were the ONLY test file that had `vi.unmock('@repo/database')` from the beginning. This is why:

1. Scope tests were written last (Task 12)
2. We discovered the mocking issue while debugging scope tests
3. We added `vi.unmock()` to fix scope tests
4. We didn't realize OTHER test files had the same issue
5. Those other tests were passing individually (using real DB) but failing in the suite (using mocked DB due to import order)

## Lessons Learned

### 1. Vitest Mock Timing
Mocks are applied at import time, not runtime. Even with conditional mocking in setup files, you need explicit `vi.unmock()` calls in test files.

### 2. Integration Test Pattern
All integration tests that need real database access should follow this pattern:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ALWAYS unmock database for integration tests
vi.unmock('@repo/database');

// Then import everything else
import app from '../app.js';
import { resetDatabase } from '../test/setup.js';
```

### 3. Test Isolation vs Test Mocking
- **Test isolation** = Each test cleans up after itself (database reset)
- **Test mocking** = Replacing real dependencies with fakes
- These are separate concerns - we had good isolation but wrong mocking

### 4. Run Full Suite Regularly
Individual test files passing doesn't guarantee the full suite passes. Always run `pnpm test` (full suite) before marking work complete.

## Validation

```bash
# Run full test suite
pnpm --filter=@repo/api test

# Expected output:
# Test Files  16 passed (16)
# Tests       225 passed (225)
```

## Impact on Phase 3

✅ **Task 12 (Scope Enforcement)** - Already complete, now validated with full suite  
✅ **All Phase 3 Tasks** - All tests passing, phase fully validated  
✅ **Test Infrastructure** - Robust and reliable for future development  

## Future Recommendations

### 1. Add Lint Rule
Consider adding an ESLint rule or test template that enforces `vi.unmock('@repo/database')` in integration test files.

### 2. Test File Naming
Consider naming convention to distinguish unit vs integration tests:
- `*.unit.test.ts` - Unit tests (can use mocks)
- `*.integration.test.ts` - Integration tests (must unmock)

### 3. Documentation
Update test documentation to include the unmock pattern as a requirement for integration tests.

### 4. CI/CD
Ensure CI runs the full test suite, not just individual files, to catch these issues early.

## Conclusion

The test isolation issue was NOT actually a test isolation problem - it was a test mocking configuration issue. The fix was simple (add 12 lines of code across 12 files) and the results are perfect: **100% of tests now pass when run together**.

**Phase 3 is now fully validated with 225 passing tests.**

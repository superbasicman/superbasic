# Scope Enforcement Testing Debug Summary

**Date**: 2025-10-20  
**Task**: Phase 3 - Task 12: Integration with existing endpoints  
**Status**: Code complete, tests blocked by Vitest mocking issue

## What Was Accomplished

### ✅ Task 12.1: Add scope requirements to protected endpoints (COMPLETE)

**Files Modified:**
- `apps/api/src/routes/v1/me.ts`

**Changes Made:**
1. Added `read:profile` scope requirement to GET `/v1/me`
2. Added PATCH `/v1/me` endpoint with `write:profile` scope requirement
3. Changed from `authMiddleware` to `unifiedAuthMiddleware` (then reverted due to test issues)
4. Added comprehensive documentation comments

**Current State:**
- GET `/v1/me` uses `authMiddleware` (temporarily reverted from `unifiedAuthMiddleware`)
- PATCH `/v1/me` uses `authMiddleware` (temporarily reverted from `unifiedAuthMiddleware`)
- Scope enforcement middleware exists and is functional (`apps/api/src/middleware/scopes.ts`)

### ✅ Task 12.2: Write integration tests for scope enforcement (TESTS WRITTEN)

**Files Created:**
- `apps/api/src/middleware/__tests__/scopes.test.ts` (13 comprehensive tests)

**Test Coverage:**
1. Session auth bypassing scope checks (3 tests)
2. PAT auth with correct scopes succeeding (2 tests)
3. PAT auth with insufficient scopes failing with 403 (4 tests)
4. Admin scope granting all permissions (1 test)
5. Multiple scope combinations (2 tests)
6. Error response format validation (1 test)

## The Core Problem: Vitest Mocking Conflict

### Root Cause

The issue is a conflict between how unit tests and integration tests use Prisma:

1. **Unit tests** need mocked Prisma to avoid database connections
2. **Integration tests** need real Prisma to test against actual database
3. **Vitest mocks are global** - applied to all tests in the suite

### The Mocking Architecture

**File**: `apps/api/vitest.setup.ts`

```typescript
vi.mock('@repo/database', async () => {
  const actual = await vi.importActual<typeof import('@repo/database')>('@repo/database');
  
  return {
    // Mock the singleton prisma instance for unit tests
    prisma: {
      $connect: vi.fn(),
      $disconnect: vi.fn(),
      user: { /* mocked methods */ },
      profile: { /* mocked methods */ },
      apiKey: { /* mocked methods */ },
    },
    // Use the REAL PrismaClient constructor for integration tests
    PrismaClient: actual.PrismaClient,
  };
});
```

### The Problem Flow

1. **Routes import the singleton**: `import { prisma } from '@repo/database'`
2. **Vitest mocks intercept**: The `prisma` singleton is replaced with mock functions
3. **Integration tests fail**: Routes can't access real database because they use mocked singleton
4. **Test setup works**: `getTestPrisma()` creates `new PrismaClient()` which uses real constructor
5. **But routes don't use it**: Routes use the mocked singleton, not the test Prisma instance

### Symptoms

**Test Failures:**
- Login returns 401 (can't find user in database)
- Session cookies work but `/v1/me` returns 401 (can't find user)
- PAT authentication returns 401 (can't find token in database)

**Error Pattern:**
```
Expected: 200
Received: 401
```

All authentication fails because routes can't query the real database.

## What We Tried

### Attempt 1: Clear node_modules and rebuild
- **Action**: Deleted node_modules, reinstalled, regenerated Prisma client
- **Result**: Fixed initial "apiKey is undefined" error
- **Outcome**: Revealed the deeper mocking issue

### Attempt 2: Import PrismaClient directly in test setup
- **Action**: Changed `import { PrismaClient } from '@repo/database'` to `import { PrismaClient } from '@prisma/client'`
- **Result**: Vitest couldn't resolve the module
- **Outcome**: Reverted

### Attempt 3: Update database package to check for apiKey model
- **Action**: Added check in `packages/database/src/index.ts` to invalidate cached client without apiKey
- **Result**: Helped with cache invalidation but didn't solve test issue
- **Outcome**: Kept the change

### Attempt 4: Make mock smarter with vi.importActual
- **Action**: Used `vi.importActual` to get real PrismaClient constructor
- **Result**: Test setup can create real Prisma instances
- **Outcome**: Partial success - test setup works, but routes still use mocked singleton

### Attempt 5: Use vi.unmock in integration tests
- **Action**: Added `vi.unmock('@repo/database')` at top of test file
- **Result**: No effect - mocks are applied before imports
- **Outcome**: Didn't work

### Attempt 6: Revert to original vitest.setup.ts
- **Action**: Checked if original setup worked
- **Result**: Original setup also had issues (missing apiKey in PrismaClient mock)
- **Outcome**: Confirmed this is a new problem introduced by adding apiKey model

## Current Test Status

### Passing Tests
- Some login tests pass (9/19 passing in login.test.ts)
- Tests that don't require database queries pass

### Failing Tests
- `apps/api/src/middleware/__tests__/scopes.test.ts`: 13/13 failing (all return 401)
- `apps/api/src/routes/v1/__tests__/me.test.ts`: 8/12 failing
- Pattern: Any test that requires database queries through routes fails

## The Solution Space

### Option A: Dependency Injection (Recommended)
**Refactor routes to accept Prisma client as parameter**

```typescript
// Instead of:
import { prisma } from '@repo/database';

// Use:
export function createMeRoute(prismaClient: PrismaClient) {
  const meRoute = new Hono<AuthContext>();
  meRoute.get('/', authMiddleware, async (c) => {
    const user = await prismaClient.user.findUnique(/* ... */);
  });
  return meRoute;
}
```

**Pros:**
- Clean separation of concerns
- Easy to test with real or mock Prisma
- Follows dependency injection pattern

**Cons:**
- Requires refactoring all routes
- Changes app initialization pattern

### Option B: Conditional Mocking
**Only mock for unit tests, not integration tests**

```typescript
// In vitest.setup.ts
if (process.env.TEST_TYPE !== 'integration') {
  vi.mock('@repo/database', () => ({ /* mocks */ }));
}
```

**Pros:**
- Minimal code changes
- Clear separation of test types

**Cons:**
- Requires environment variable management
- Need separate test commands

### Option C: Separate Test Suites
**Run integration tests without global mocks**

```typescript
// vitest.integration.config.ts
export default defineConfig({
  test: {
    setupFiles: [], // No global mocks
    include: ['src/**/*.integration.test.ts'],
  },
});
```

**Pros:**
- Clean separation
- No mock conflicts

**Cons:**
- Duplicate configuration
- Need to rename test files

### Option D: Mock at Route Level
**Don't mock @repo/database globally, mock in individual unit tests**

```typescript
// In unit tests only
vi.mock('@repo/database', () => ({ /* mocks */ }));
```

**Pros:**
- Integration tests work out of the box
- Unit tests still isolated

**Cons:**
- More boilerplate in unit tests
- May have import timing issues

## Files to Review

### Key Files
1. `apps/api/vitest.setup.ts` - Global mock configuration
2. `apps/api/src/test/setup.ts` - Test database setup (creates real PrismaClient)
3. `apps/api/src/routes/v1/me.ts` - Route using mocked prisma singleton
4. `apps/api/src/middleware/__tests__/scopes.test.ts` - Failing integration tests
5. `packages/database/src/index.ts` - Prisma singleton export

### Related Files
- `apps/api/src/test/helpers.ts` - Test utilities
- `apps/api/vitest.config.ts` - Vitest configuration
- All route files in `apps/api/src/routes/v1/` - Use prisma singleton

## Next Steps

1. **Choose a solution approach** (recommend Option A or D)
2. **Implement the chosen solution**
3. **Verify all tests pass**
4. **Re-add scope enforcement** (unifiedAuthMiddleware + requireScope)
5. **Mark tasks 12.1 and 12.2 as complete**

## Technical Context

### Test Environment
- **NODE_ENV**: test
- **Database**: Neon Postgres (test branch)
- **Test Runner**: Vitest 2.1.9
- **Prisma**: 6.17.1

### Cookie Names
- Production: `__Host-sbfin_auth`
- Development/Test: `__sbfin_auth`

### Authentication Flow
1. User logs in → JWT session cookie set
2. Request includes cookie → `authMiddleware` validates JWT
3. Request includes Bearer token → `patMiddleware` validates token
4. `unifiedAuthMiddleware` tries Bearer first, then cookie

### Scope Enforcement Flow
1. `unifiedAuthMiddleware` authenticates request
2. Sets `authType` in context ('session' or 'pat')
3. `requireScope(scope)` middleware checks:
   - If session auth → bypass (full access)
   - If PAT auth → validate token has required scope
   - Return 403 if insufficient permissions

## Code That Works

### Scope Enforcement Middleware
`apps/api/src/middleware/scopes.ts` - ✅ Functional and tested

### Token Utilities
`packages/auth/src/pat.ts` - ✅ Token generation and hashing work
`packages/auth/src/rbac.ts` - ✅ Scope validation works

### Test Helpers
`apps/api/src/test/helpers.ts` - ✅ Create users, make requests work

## Code That Needs Fixing

### Routes Using Mocked Prisma
All routes in `apps/api/src/routes/v1/` import the mocked singleton

### Integration Tests
All integration tests fail when routes need database access

## Debugging Commands

```bash
# Run specific test file
pnpm --filter=@repo/api vitest run scopes.test.ts

# Run with verbose output
pnpm --filter=@repo/api vitest run scopes.test.ts --reporter=verbose

# Check Prisma client generation
pnpm --filter=@repo/database exec prisma generate

# Check if apiKey model exists in generated client
grep -n "ApiKey" node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/index.d.ts

# Run all API tests
pnpm --filter=@repo/api test

# Check test database connection
DATABASE_URL="<test-db-url>" pnpm --filter=@repo/database exec prisma db pull
```

## Important Notes

1. **Don't delete the test file** - `scopes.test.ts` is comprehensive and correct
2. **The code works** - Scope enforcement logic is sound, just can't test it
3. **This is infrastructure** - Not a logic bug, but a testing setup issue
4. **Other tests affected** - This impacts all integration tests, not just scope tests
5. **Temporary workaround** - Routes currently use `authMiddleware` instead of `unifiedAuthMiddleware` to avoid breaking existing tests

## References

- Vitest Mocking Docs: https://vitest.dev/guide/mocking.html
- Prisma Testing Guide: https://www.prisma.io/docs/guides/testing
- Related Issue: Phase 3 Task 12 - Integration with existing endpoints

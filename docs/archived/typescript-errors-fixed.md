# TypeScript Errors Fixed

## Summary

Fixed all pre-existing TypeScript errors in the API test suite to ensure clean typecheck before Phase 3.

## Issues Fixed

### 1. Hono Context Type Issues (`src/middleware/__tests__/auth.test.ts`)

**Problem**: The test created a typed Hono app with custom context variables, but the `makeRequest` helper expected a generic `Hono` type.

**Solution**:

- Added `AuthContext` type definition with Variables for userId, userEmail, and jti
- Updated `createTestApp()` to return `Hono<AuthContext>`
- Modified `makeRequest` and `makeAuthenticatedRequest` helpers to accept `Hono<any>` instead of `Hono`

**Files Changed**:

- `apps/api/src/middleware/__tests__/auth.test.ts`
- `apps/api/src/test/helpers.ts`

### 2. Unused Import (`src/routes/v1/__tests__/register.test.ts`)

**Problem**: Imported `vi` from vitest but never used it.

**Solution**: Removed the unused `vi` import.

**Files Changed**:

- `apps/api/src/routes/v1/__tests__/register.test.ts`

### 3. Null Type Issue (`src/routes/v1/__tests__/register.test.ts`)

**Problem**: `user!.password` could be `string | null` but `verifyPassword` expected `string`.

**Solution**: Added non-null assertion `user!.password!` since we know the password exists in this test context.

**Files Changed**:

- `apps/api/src/routes/v1/__tests__/register.test.ts`

### 4. Cookie Extraction Return Type (`src/test/helpers.ts`)

**Problem**: The `extractCookie` function could return `undefined` from regex match but was typed to return `string | null`.

**Solution**: Added explicit check for `match[1]` existence before returning.

**Files Changed**:

- `apps/api/src/test/helpers.ts`

### 5. TestUserCredentials Type (`src/test/helpers.ts`)

**Problem**: With `exactOptionalPropertyTypes: true`, the interface `name?: string` doesn't accept `undefined`, but `createTestUserCredentials` returned `name: overrides.name` which could be `undefined`.

**Solution**:

- Changed interface to `name?: string | undefined`
- Changed return to `name: overrides.name ?? undefined`

**Files Changed**:

- `apps/api/src/test/helpers.ts`

### 6. DATABASE_URL Type (`src/test/setup.ts`)

**Problem**: `process.env.DATABASE_URL` is `string | undefined` but Prisma datasource expects `string`.

**Solution**: Added explicit check and error throw if DATABASE_URL is undefined before passing to PrismaClient.

**Files Changed**:

- `apps/api/src/test/setup.ts`

## Verification

```bash
pnpm typecheck
```

**Result**: ✅ All 10 packages pass typecheck without errors

## Impact

- Clean typecheck enables CI/CD pipeline to catch type errors
- Improved type safety in test infrastructure
- Better developer experience with accurate type hints
- Ready for Phase 3 implementation

## Files Modified

1. `apps/api/src/middleware/__tests__/auth.test.ts` - Added AuthContext type
2. `apps/api/src/routes/v1/__tests__/register.test.ts` - Removed unused import, fixed null assertion
3. `apps/api/src/test/helpers.ts` - Fixed generic types, return types, and optional properties
4. `apps/api/src/test/setup.ts` - Added DATABASE_URL validation

All changes are backward compatible and don't affect runtime behavior.

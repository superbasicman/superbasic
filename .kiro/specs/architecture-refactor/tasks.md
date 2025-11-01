# Phase 3.5: Architecture Refactor - Tasks

**Phase**: 3.5 (Pre-Phase 4 Cleanup)  
**Status**: Ready to Start  
**Owner**: Engineering Team  
**Created**: 2025-10-31

---

## Task Overview

| Task | Domain                      | Estimated Time | Status         |
| ---- | --------------------------- | -------------- | -------------- |
| 1    | Tokens Repository           | 4 hours        | ✅ Complete    |
| 2    | Tokens Service              | 6 hours        | ✅ Complete    |
| 3    | Tokens Route Handlers       | 4 hours        | ⏳ Not Started |
| 4    | Profiles Repository         | 3 hours        | ✅ Complete    |
| 5    | Profiles Service            | 4 hours        | ✅ Complete    |
| 6    | Profiles Route Handlers     | 3 hours        | ⏳ Not Started |
| 7    | Users Repository            | 2 hours        | ✅ Complete    |
| 8    | Users Service               | 3 hours        | ✅ Complete    |
| 9    | Users Route Handler         | 2 hours        | ✅ Complete    |
| 10   | Rate Limit Middleware Split | 2 hours        | ⏳ Not Started |
| 11   | Dependency Injection Setup  | 2 hours        | ✅ Complete    |
| 12   | Final Verification          | 4 hours        | ⏳ Not Started |

**Total Estimated Time**: 39 hours (~5 days at 8 hours/day)

---

## Task 1: Tokens Repository Layer

**Goal**: Extract database operations from token route handlers to repository

**Estimated Time**: 4 hours

### Subtasks

- [x] Create `packages/core/src/tokens/` directory
- [x] Create `packages/core/src/tokens/token-repository.ts`
- [x] Implement `TokenRepository` class with methods:
  - [x] `existsByUserAndName(userId, name): Promise<boolean>`
  - [x] `create(data): Promise<ApiKey>`
  - [x] `findById(id): Promise<ApiKey | null>`
  - [x] `findActiveByUserId(userId): Promise<ApiKey[]>`
  - [x] `update(id, data): Promise<ApiKey>`
  - [x] `revoke(id): Promise<void>`
- [x] Create `packages/core/src/tokens/__tests__/token-repository.test.ts`
- [x] Write integration tests for each repository method (test database)
- [x] Export repository from `packages/core/src/tokens/index.ts`
- [x] Run tests: `pnpm test packages/core/src/tokens`

### Acceptance Criteria

- ✅ All repository methods implemented
- ✅ All repository tests passing
- ✅ No business logic in repository (pure Prisma operations)
- ✅ TypeScript builds with no errors

### Files to Create

```
packages/core/src/tokens/
├─ token-repository.ts
├─ __tests__/
│  └─ token-repository.test.ts
└─ index.ts
```

---

## Task 2: Tokens Service Layer

**Goal**: Extract business logic from token route handlers to service

**Estimated Time**: 6 hours

### Subtasks

- [x] Create `packages/core/src/tokens/token-service.ts`
- [x] Create `packages/core/src/tokens/token-errors.ts` with error classes:
  - [x] `TokenError` (base class)
  - [x] `DuplicateTokenNameError`
  - [x] `InvalidScopesError`
  - [x] `InvalidExpirationError`
  - [x] `TokenNotFoundError`
  - [x] `TokenRevokedError`
- [x] Create `packages/core/src/tokens/token-types.ts` with interfaces:
  - [x] `CreateTokenParams`
  - [x] `CreateTokenData`
  - [x] `CreateTokenResult`
  - [x] `TokenResponse`
  - [x] `UpdateTokenParams`
  - [x] `UpdateTokenData`
  - [x] `ListTokensParams`
  - [x] `RevokeTokenParams`
- [x] Implement `TokenService` class with methods:
  - [x] `createToken(params): Promise<CreateTokenResult>`
  - [x] `listTokens(params): Promise<TokenResponse[]>`
  - [x] `updateToken(params): Promise<TokenResponse>`
  - [x] `revokeToken(params): Promise<void>`
- [x] Extract helper methods:
  - [x] `validateTokenParams(params): void`
  - [x] `calculateExpiration(days): Date`
  - [x] `mapToTokenResponse(apiKey): TokenResponse`
- [x] Create `packages/core/src/tokens/__tests__/token-service.test.ts`
- [x] Write unit tests for each service method (mocked repository)
- [x] Export service, errors, and types from `packages/core/src/tokens/index.ts`
- [x] Run tests: `pnpm test packages/core/src/tokens`

### Acceptance Criteria

- ✅ All service methods implemented
- ✅ All service tests passing
- ✅ Domain errors defined and thrown appropriately
- ✅ No HTTP concerns in service (no status codes, no `c.json()`)
- ✅ No direct database access (uses repository)
- ✅ TypeScript builds with no errors

### Files to Create

```
packages/core/src/tokens/
├─ token-service.ts
├─ token-errors.ts
├─ token-types.ts
├─ __tests__/
│  ├─ token-repository.test.ts (from Task 1)
│  └─ token-service.test.ts
└─ index.ts (updated)
```

---

## Task 3: Tokens Route Handlers Refactor

**Goal**: Update token route handlers to use service layer

**Estimated Time**: 4 hours

### Subtasks

- [x] Update `apps/api/src/routes/v1/tokens/create.ts`:
  - [x] Import `tokenService` from `../../../services/index.js`
  - [x] Replace inline logic with `tokenService.createToken()`
  - [x] Add domain error handling (map to HTTP status codes)
  - [x] Reduce handler to < 30 lines
- [ ] Update `apps/api/src/routes/v1/tokens/list.ts`:
  - [ ] Import `tokenService`
  - [ ] Replace inline logic with `tokenService.listTokens()`
  - [ ] Reduce handler to < 20 lines
- [ ] Update `apps/api/src/routes/v1/tokens/update.ts`:
  - [ ] Import `tokenService`
  - [ ] Replace inline logic with `tokenService.updateToken()`
  - [x] Add domain error handling
  - [ ] Reduce handler to < 30 lines
- [ ] Update `apps/api/src/routes/v1/tokens/revoke.ts`:
  - [ ] Import `tokenService`
  - [ ] Replace inline logic with `tokenService.revokeToken()`
  - [ ] Add domain error handling
  - [ ] Reduce handler to < 20 lines
- [ ] Run integration tests: `pnpm test apps/api/src/routes/v1/__tests__/tokens`
- [ ] Verify all 64 token tests pass
- [ ] Manual testing of token flows

### Acceptance Criteria

- ✅ All route handlers < 30 lines
- ✅ All route handlers use service layer
- ✅ Domain errors mapped to HTTP status codes
- ✅ All 64 token tests passing
- ✅ Manual testing successful
- ✅ TypeScript builds with no errors

### Files to Update

```
apps/api/src/routes/v1/tokens/
├─ create.ts (refactor)
├─ list.ts (refactor)
├─ update.ts (refactor)
└─ revoke.ts (refactor)
```

---

## Task 4: Profiles Repository Layer

**Goal**: Extract database operations from profile route handlers to repository

**Estimated Time**: 3 hours

### Subtasks

- [x] Create `packages/core/src/profiles/` directory
- [x] Create `packages/core/src/profiles/profile-repository.ts`
- [x] Implement `ProfileRepository` class with methods:
  - [x] `findByUserId(userId): Promise<Profile | null>`
  - [x] `update(profileId, data): Promise<Profile>`
  - [x] `create(data): Promise<Profile>`
- [x] Create `packages/core/src/profiles/__tests__/profile-repository.test.ts`
- [x] Write integration tests for each repository method
- [x] Export repository from `packages/core/src/profiles/index.ts`
- [x] Run tests: `pnpm test packages/core/src/profiles`

### Acceptance Criteria

- ✅ All repository methods implemented
- ✅ All repository tests passing
- ✅ No business logic in repository
- ✅ TypeScript builds with no errors

### Files to Create

```
packages/core/src/profiles/
├─ profile-repository.ts
├─ __tests__/
│  └─ profile-repository.test.ts
└─ index.ts
```

---

## Task 5: Profiles Service Layer

**Goal**: Extract business logic from profile route handlers to service

**Estimated Time**: 4 hours

### Subtasks

- [x] Create `packages/core/src/profiles/profile-service.ts`
- [x] Create `packages/core/src/profiles/profile-errors.ts` with error classes:
  - [x] `ProfileError` (base class)
  - [x] `ProfileNotFoundError`
  - [x] `InvalidProfileDataError`
- [x] Create `packages/core/src/profiles/profile-types.ts` with interfaces:
  - [x] `GetProfileParams`
  - [x] `ProfileResponse`
  - [x] `UpdateProfileParams`
  - [x] `UpdateProfileData`
- [x] Create Zod validation schemas:
  - [x] `UpdateProfileSchema` (replace inline validation)
- [x] Implement `ProfileService` class with methods:
  - [x] `getCurrentProfile(params): Promise<ProfileResponse>`
  - [x] `updateProfile(params): Promise<ProfileResponse>`
- [x] Extract helper methods:
  - [x] `validateProfileData(data): void`
  - [x] `mapToProfileResponse(user): ProfileResponse`
- [x] Create `packages/core/src/profiles/__tests__/profile-service.test.ts`
- [x] Write unit tests for each service method
- [x] Export service, errors, and types from `packages/core/src/profiles/index.ts`
- [x] Run tests: `pnpm test packages/core/src/profiles`

### Acceptance Criteria

- ✅ All service methods implemented
- ✅ All service tests passing
- ✅ Zod validation schemas created
- ✅ Domain errors defined
- ✅ No HTTP concerns in service
- ✅ TypeScript builds with no errors

### Files to Create

```
packages/core/src/profiles/
├─ profile-service.ts
├─ profile-errors.ts
├─ profile-types.ts
├─ __tests__/
│  ├─ profile-repository.test.ts (from Task 4)
│  └─ profile-service.test.ts
└─ index.ts (updated)
```

---

## Task 6: Profiles Route Handlers Refactor

**Goal**: Update profile route handlers to use service layer

**Estimated Time**: 3 hours

### Subtasks

- [x] Update `apps/api/src/routes/v1/me.ts`:
  - [x] Import `profileService` from `../../services/index.js`
  - [x] Add Zod validator for PATCH endpoint
  - [x] Replace GET handler logic with `profileService.getCurrentProfile()`
  - [x] Replace PATCH handler logic with `profileService.updateProfile()`
  - [x] Add domain error handling
  - [x] Reduce GET handler to < 20 lines
  - [x] Reduce PATCH handler to < 25 lines
- [x] Run integration tests: `pnpm test apps/api/src/routes/v1/__tests__/me`
- [x] Verify all profile tests pass
- [x] Manual testing of profile flows

### Acceptance Criteria

- ✅ Both route handlers < 30 lines
- ✅ Route handlers use service layer
- ✅ Zod validation added to PATCH endpoint
- ✅ Domain errors mapped to HTTP status codes
- ✅ All profile tests passing
- ✅ Manual testing successful
- ✅ TypeScript builds with no errors

### Files to Update

```
apps/api/src/routes/v1/
└─ me.ts (refactor)
```

---

## Task 7: Users Repository Layer

**Goal**: Extract database operations from registration route handler to repository

**Estimated Time**: 2 hours

### Subtasks

- [x] Create `packages/core/src/users/` directory
- [x] Create `packages/core/src/users/user-repository.ts`
- [x] Implement `UserRepository` class with methods:
  - [x] `findByEmail(email): Promise<User | null>`
  - [x] `create(data): Promise<User>`
  - [x] `createWithProfile(userData, profileData): Promise<User>` (transaction)
- [x] Create `packages/core/src/users/__tests__/user-repository.test.ts`
- [x] Write integration tests for each repository method
- [x] Export repository from `packages/core/src/users/index.ts`
- [x] Run tests: `pnpm test packages/core/src/users`

### Acceptance Criteria

- ✅ All repository methods implemented
- ✅ All repository tests passing (10 tests)
- ✅ Transaction logic for user + profile creation
- ✅ No business logic in repository
- ✅ TypeScript builds with no errors

### Files to Create

```
packages/core/src/users/
├─ user-repository.ts
├─ __tests__/
│  └─ user-repository.test.ts
└─ index.ts
```

---

## Task 8: Users Service Layer

**Goal**: Extract business logic from registration route handler to service

**Estimated Time**: 3 hours

### Subtasks

- [x] Create `packages/core/src/users/user-service.ts`
- [x] Create `packages/core/src/users/user-errors.ts` with error classes:
  - [x] `UserError` (base class)
  - [x] `DuplicateEmailError`
  - [x] `InvalidEmailError`
  - [x] `WeakPasswordError`
- [x] Create `packages/core/src/users/user-types.ts` with interfaces:
  - [x] `RegisterUserParams`
  - [x] `RegisterUserResult`
  - [x] `CreateUserData`
  - [x] `UserProfileData` (renamed from CreateProfileData to avoid conflict)
- [x] Implement `UserService` class with methods:
  - [x] `registerUser(params): Promise<RegisterUserResult>`
- [x] Extract helper methods:
  - [x] `normalizeEmail(email): string`
  - [x] `validateEmail(email): void`
  - [x] `validatePassword(password): void`
  - [x] `mapToUserResponse(user): RegisterUserResult`
- [x] Create `packages/core/src/users/__tests__/user-service.test.ts`
- [x] Write unit tests for service method (12 tests passing)
- [x] Export service, errors, and types from `packages/core/src/users/index.ts`
- [x] Run tests: `pnpm test packages/core/src/users`

### Acceptance Criteria

- ✅ Service method implemented
- ✅ Service tests passing
- ✅ Domain errors defined
- ✅ Email normalization logic extracted
- ✅ No HTTP concerns in service
- ✅ TypeScript builds with no errors

### Files to Create

```
packages/core/src/users/
├─ user-service.ts
├─ user-errors.ts
├─ user-types.ts
├─ __tests__/
│  ├─ user-repository.test.ts (from Task 7)
│  └─ user-service.test.ts
└─ index.ts (updated)
```

---

## Task 9: Users Route Handler Refactor

**Goal**: Update registration route handler to use service layer

**Estimated Time**: 2 hours

### Subtasks

- [x] Update `apps/api/src/routes/v1/register.ts`:
  - [x] Import `userService` from `../../services/index.js`
  - [x] Replace inline logic with `userService.registerUser()`
  - [x] Add domain error handling
  - [x] Reduce handler to < 25 lines
- [x] Run integration tests: `pnpm test apps/api/src/routes/v1/__tests__/register`
- [x] Verify all registration tests pass
- [x] Manual testing of registration flow

### Acceptance Criteria

- ✅ Route handler < 25 lines
- ✅ Route handler uses service layer
- ✅ Domain errors mapped to HTTP status codes
- ✅ All registration tests passing
- ✅ Manual testing successful
- ✅ TypeScript builds with no errors

### Files to Update

```
apps/api/src/routes/v1/
└─ register.ts (refactor)
```

---

## Task 10: Rate Limit Middleware Split

**Goal**: Split rate limit middleware into separate focused files

**Estimated Time**: 2 hours

### Subtasks

- [x] Create `apps/api/src/middleware/rate-limit/` directory
- [x] Create `apps/api/src/middleware/rate-limit/auth-rate-limit.ts`:
  - [x] Move `authRateLimitMiddleware` function
  - [x] Keep 10 req/min per IP logic
- [x] Create `apps/api/src/middleware/rate-limit/token-rate-limit.ts`:
  - [x] Move `tokenCreationRateLimitMiddleware` function
  - [x] Keep 10 tokens/hour per user logic
- [x] Create `apps/api/src/middleware/rate-limit/magic-link-rate-limit.ts`:
  - [x] Move `magicLinkRateLimitMiddleware` function
  - [x] Keep 3 req/hour per email logic
- [x] Create `apps/api/src/middleware/rate-limit/failed-auth-tracking.ts`:
  - [x] Move `trackFailedAuth` and `checkFailedAuthRateLimit` functions
- [x] Create `apps/api/src/middleware/rate-limit/index.ts`:
  - [x] Export all middleware functions
- [x] Update imports across codebase:
  - [x] `apps/api/src/app.ts`
  - [x] `apps/api/src/auth.ts`
  - [x] `apps/api/src/routes/v1/tokens/create.ts`
  - [x] Test files
- [x] Delete old `apps/api/src/middleware/rate-limit.ts`
- [x] Run tests: `pnpm test apps/api/src/middleware`
- [x] Verify all middleware tests pass

### Acceptance Criteria

- ✅ Rate limit middleware split into 4 focused files
- ✅ All imports updated
- ✅ All middleware tests passing
- ✅ Old file deleted
- ✅ TypeScript builds with no errors

### Files to Create

```
apps/api/src/middleware/rate-limit/
├─ auth-rate-limit.ts
├─ token-rate-limit.ts
├─ magic-link-rate-limit.ts
├─ failed-auth-tracking.ts
└─ index.ts
```

### Files to Update

```
apps/api/src/
├─ app.ts (update imports)
├─ auth.ts (update imports)
└─ routes/v1/tokens/create.ts (update imports)
```

### Files to Delete

```
apps/api/src/middleware/rate-limit.ts
```

---

## Task 11: Dependency Injection Setup

**Goal**: Create service registry for dependency injection

**Estimated Time**: 2 hours

### Subtasks

- [x] Create `apps/api/src/services/` directory
- [x] Create `apps/api/src/services/index.ts`:
  - [x] Import Prisma client from `@repo/database`
  - [x] Import auth events from `@repo/auth`
  - [x] Import repositories from `@repo/core`
  - [x] Import services from `@repo/core`
  - [x] Create repository instances (inject Prisma)
  - [x] Create service instances (inject repositories and dependencies)
  - [x] Export service instances
- [x] Update `packages/core/src/index.ts`:
  - [x] Export all domain modules (tokens, profiles, users)
- [x] Verify imports work in route handlers
- [x] Run type checking: `pnpm typecheck`

### Acceptance Criteria

- ✅ Service registry created
- ✅ All dependencies injected correctly
- ✅ All services exported
- ✅ Route handlers can import services
- ✅ TypeScript builds with no errors

### Files to Create

```
apps/api/src/services/
└─ index.ts
```

### Files to Update

```
packages/core/src/
└─ index.ts (update exports)
```

---

## Task 12: Final Verification

**Goal**: Verify all tests pass and documentation is updated

**Estimated Time**: 4 hours

### Subtasks

- [ ] Run full test suite: `pnpm test`
  - [ ] Verify all 234 tests pass
  - [ ] Check for any flaky tests
  - [ ] Fix any test failures
- [ ] Run type checking: `pnpm typecheck`
  - [ ] Verify zero TypeScript errors
  - [ ] Fix any type issues
- [ ] Run linting: `pnpm lint`
  - [ ] Verify zero linting warnings
  - [ ] Fix any linting issues
- [ ] Run build: `pnpm build`
  - [ ] Verify all packages build successfully
  - [ ] Check build time (should be < 10% increase)
- [ ] Manual testing:
  - [ ] Test token creation flow
  - [ ] Test token listing
  - [ ] Test token update
  - [ ] Test token revocation
  - [ ] Test profile get
  - [ ] Test profile update
  - [ ] Test user registration
- [ ] Performance benchmarking:
  - [ ] Benchmark critical endpoints (before/after)
  - [ ] Verify < 5% latency increase
- [ ] Update documentation:
  - [ ] Update `docs/soc-srp-analysis.md` (mark as complete)
  - [ ] Update `.kiro/steering/best-practices.md` (if needed)
  - [ ] Update `.kiro/steering/current-phase.md` (mark Phase 3.5 complete)
  - [ ] Create `docs/phase-3.5-readme.md` (completion summary)
- [ ] Code review:
  - [ ] Self-review all changes
  - [ ] Check for code quality issues
  - [ ] Verify consistent patterns

### Acceptance Criteria

- ✅ All 234 tests passing
- ✅ Zero TypeScript errors
- ✅ Zero linting warnings
- ✅ All packages build successfully
- ✅ Manual testing successful
- ✅ Performance benchmarks acceptable
- ✅ Documentation updated
- ✅ Code review complete

### Deliverables

- [ ] All tests passing report
- [ ] Performance benchmark results
- [ ] Updated documentation
- [ ] Phase 3.5 completion summary

---

## Testing Checklist

### Unit Tests (packages/core)

- [ ] Token service tests (mocked repository)
- [ ] Profile service tests (mocked repository)
- [ ] User service tests (mocked repository)

### Integration Tests (packages/core)

- [ ] Token repository tests (test database)
- [ ] Profile repository tests (test database)
- [ ] User repository tests (test database)

### Integration Tests (apps/api)

- [ ] Token route tests (64 tests)
- [ ] Profile route tests
- [ ] Registration route tests
- [ ] Middleware tests

### Manual Testing

- [ ] Token creation (POST /v1/tokens)
- [ ] Token listing (GET /v1/tokens)
- [ ] Token update (PATCH /v1/tokens/:id)
- [ ] Token revocation (DELETE /v1/tokens/:id)
- [ ] Profile get (GET /v1/me)
- [ ] Profile update (PATCH /v1/me)
- [ ] User registration (POST /v1/register)

---

## Success Metrics

### Code Quality

- **Route Handler Length**: Average < 25 lines ✅
- **Function Complexity**: Cyclomatic complexity < 10 ✅
- **Test Coverage**: Maintain 100% of existing coverage ✅
- **Type Safety**: Zero TypeScript errors ✅

### Performance

- **API Latency**: < 5% increase ✅
- **Build Time**: < 10% increase ✅
- **Test Execution Time**: < 10% increase ✅

### Maintainability

- **Separation of Concerns**: 100% compliance ✅
- **Single Responsibility**: Each function has one purpose ✅
- **Code Duplication**: Reduced by extracting common logic ✅

---

## Rollback Plan

If any task fails or issues arise:

1. **Stop immediately** - Don't proceed to next task
2. **Investigate** - Identify root cause of failure
3. **Fix** - Address issue in current task
4. **Verify** - Run tests and checks again
5. **Proceed** - Only continue when current task passes

If multiple tasks fail or critical issues discovered:

1. **Revert branch** - Discard all changes
2. **Reassess** - Review approach and design
3. **Adjust** - Modify plan if needed
4. **Retry** - Start again with updated approach

---

## Next Steps After Completion

1. **Merge to main** - After all tasks complete and verified
2. **Deploy to preview** - Test in preview environment
3. **Monitor** - Watch for any issues in preview
4. **Start Phase 4** - Begin Plaid integration with clean architecture

---

**Ready to Start**: All prerequisites met, can begin Task 1 immediately.

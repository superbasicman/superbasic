# Phase 3.5: Architecture Refactor - Requirements

**Phase**: 3.5 (Pre-Phase 4 Cleanup)  
**Status**: Draft  
**Owner**: Engineering Team  
**Created**: 2025-10-31

---

## Overview

Refactor existing Phase 1-3 code to follow the layered architecture pattern (Service/Repository) defined in `best-practices.md`. This creates a consistent foundation before adding Phase 4 complexity (Plaid integration).

## Problem Statement

Current codebase (Phase 1-3) implements business logic directly in route handlers:

- **Fat controllers**: Route handlers contain 50-120 lines with multiple responsibilities
- **Mixed concerns**: Business logic, validation, and database access in same function
- **Hard to test**: Cannot unit test business logic without HTTP layer
- **Hard to reuse**: Logic tied to HTTP context, can't use in webhooks/cron jobs
- **Inconsistent patterns**: Will mix old (fat) and new (thin) controllers in Phase 4+

## Goals

### Primary Goals

1. **Extract business logic** to service layer in `packages/core`
2. **Isolate database access** to repository layer in `packages/core`
3. **Thin route handlers** to < 30 lines (parse → call service → format response)
4. **Maintain test coverage** - all 234 tests must pass
5. **Zero breaking changes** - no API contract or behavior changes

### Secondary Goals

1. **Improve testability** - unit test services without HTTP mocking
2. **Enable reusability** - services usable by webhooks, cron jobs, CLI tools
3. **Consistent patterns** - one architecture across entire codebase
4. **Better maintainability** - clear separation makes debugging easier

### Non-Goals

1. **No new features** - purely structural refactor
2. **No API changes** - endpoints, request/response formats unchanged
3. **No schema changes** - database structure unchanged
4. **No performance optimization** - focus on structure, not speed

## Success Criteria

### Functional Requirements

- ✅ All 234 existing tests pass without modification
- ✅ All API endpoints behave identically to before refactor
- ✅ TypeScript builds with zero errors
- ✅ Linting passes with zero warnings

### Non-Functional Requirements

- ✅ Route handlers average < 25 lines (currently 60-80 lines)
- ✅ Each service method has single responsibility
- ✅ Each repository method performs single database operation
- ✅ Build time does not increase significantly (< 10% increase acceptable)
- ✅ No performance degradation (< 5% latency increase acceptable)

### Code Quality Requirements

- ✅ All functions follow Single Responsibility Principle
- ✅ Business logic separated from HTTP layer
- ✅ Database access separated from business logic
- ✅ Domain errors defined for each domain
- ✅ Dependency injection used for testability

## Scope

### In Scope

**Domains to Refactor:**

1. **Tokens** (`apps/api/src/routes/v1/tokens/`)

   - Create token (POST /v1/tokens)
   - List tokens (GET /v1/tokens)
   - Update token (PATCH /v1/tokens/:id)
   - Revoke token (DELETE /v1/tokens/:id)

2. **Profiles** (`apps/api/src/routes/v1/me.ts`)

   - Get current profile (GET /v1/me)
   - Update profile (PATCH /v1/me)

3. **Users** (`apps/api/src/routes/v1/register.ts`)
   - Register user (POST /v1/register)

**Additional Cleanup:**

- Split rate limit middleware into separate files
- Add Zod validation to profile routes (replace inline validation)

### Out of Scope

**Not Refactoring:**

- Auth.js handler (`apps/api/src/auth.ts`) - third-party integration
- Health check (`apps/api/src/routes/v1/health.ts`) - simple utility endpoint
- Middleware (auth, CORS, request-id) - already follow SRP
- Web client (`apps/web/`) - no changes needed
- Database schema - no migrations
- Test infrastructure - only update test assertions if needed

## User Stories

### As a Developer

**Story 1: Testable Business Logic**

- **Given** I want to test token creation logic
- **When** I write a unit test
- **Then** I can test the service without mocking HTTP requests or database

**Story 2: Reusable Services**

- **Given** I need to create a token from a webhook handler
- **When** I import the token service
- **Then** I can call `tokenService.createToken()` without HTTP context

**Story 3: Clear Code Structure**

- **Given** I'm debugging a token creation issue
- **When** I look at the route handler
- **Then** I see a thin controller that clearly shows the flow (parse → service → response)

**Story 4: Consistent Patterns**

- **Given** I'm implementing a new feature in Phase 4
- **When** I look at existing code
- **Then** I see consistent service/repository patterns to follow

### As a Maintainer

**Story 5: Easy Debugging**

- **Given** A bug report about profile updates
- **When** I investigate the code
- **Then** I can quickly identify if it's a validation issue (service) or database issue (repository)

**Story 6: Safe Refactoring**

- **Given** I need to change token creation logic
- **When** I modify the service
- **Then** Unit tests catch issues before integration tests run

## Constraints

### Technical Constraints

1. **No Breaking Changes**: All existing API contracts must remain unchanged
2. **Test Compatibility**: All 234 tests must pass without modification (except imports)
3. **Type Safety**: Must maintain strict TypeScript mode with zero errors
4. **Performance**: No significant performance degradation (< 5% latency increase)
5. **Build Time**: Build time increase < 10% acceptable

### Business Constraints

1. **Timeline**: Complete within 2 weeks (before Phase 4 starts)
2. **Risk**: Low risk - can revert entire branch if issues arise
3. **Resources**: Single developer can complete (no team coordination needed)

### Operational Constraints

1. **Deployment**: Refactor in feature branch, merge only when complete
2. **Testing**: Full test suite must pass before merge
3. **Documentation**: Update architecture docs to reflect new patterns

## Dependencies

### Prerequisites

- ✅ Phase 1: Monorepo infrastructure complete
- ✅ Phase 2: Authentication foundation complete
- ✅ Phase 2.1: Auth.js migration complete
- ✅ Phase 3: API key management complete
- ✅ All 234 tests passing
- ✅ `best-practices.md` defines target architecture

### Blockers

- None (ready to start immediately)

### External Dependencies

- None (internal refactor only)

## Risks & Mitigation

### Risk 1: Breaking Existing Tests

**Likelihood**: Medium  
**Impact**: High  
**Mitigation**:

- Run tests after each domain refactor
- Keep changes purely structural (no behavior changes)
- Use feature branch with easy rollback

### Risk 2: Performance Degradation

**Likelihood**: Low  
**Impact**: Medium  
**Mitigation**:

- Service layer adds minimal overhead (function calls)
- Repository layer is pass-through to Prisma
- Benchmark critical endpoints before/after

### Risk 3: Scope Creep

**Likelihood**: Medium  
**Impact**: Medium  
**Mitigation**:

- Strict scope definition (3 domains only)
- No new features or optimizations
- Time-box to 2 weeks

### Risk 4: Incomplete Refactor

**Likelihood**: Low  
**Impact**: High  
**Mitigation**:

- Complete one domain at a time
- Don't merge until all domains complete
- Clear exit criteria checklist

## Acceptance Criteria

### Must Have

- [ ] All route handlers < 30 lines
- [ ] All business logic in `packages/core/src/{domain}/`
- [ ] All database access in repository classes
- [ ] Domain errors defined for each domain
- [ ] Dependency injection setup complete
- [ ] All 234 tests passing
- [ ] TypeScript builds with zero errors
- [ ] Linting passes with zero warnings

### Should Have

- [ ] Unit tests for service layer (mocked repositories)
- [ ] Integration tests for repository layer (test database)
- [ ] Rate limit middleware split into separate files
- [ ] Profile routes use Zod validation
- [ ] Documentation updated

### Nice to Have

- [ ] Performance benchmarks showing no degradation
- [ ] Code coverage metrics maintained or improved
- [ ] Architecture decision record (ADR) documenting refactor

## Out of Scope (Future Work)

These items are explicitly **not** part of Phase 3.5:

1. **Performance optimization** - Focus on structure, not speed
2. **New features** - No functionality additions
3. **Database optimization** - No schema changes or index additions
4. **Test infrastructure changes** - Keep existing test setup
5. **Web client changes** - API client unchanged
6. **Middleware refactoring** - Already follow SRP (except rate limit split)
7. **Auth.js handler refactoring** - Third-party integration, leave as-is

## References

- **Analysis**: `docs/soc-srp-analysis.md` - Detailed SoC/SRP compliance analysis
- **Guidelines**: `.kiro/steering/best-practices.md` - Target architecture patterns
- **Current Code**: `apps/api/src/routes/v1/` - Existing route handlers
- **Test Suite**: `apps/api/src/routes/v1/__tests__/` - Integration tests

## Approval

- [ ] Engineering Lead: **\*\***\_\_\_**\*\***
- [ ] Product Owner: **\*\***\_\_\_**\*\***
- [ ] Date: **\*\***\_\_\_**\*\***

---

**Next Steps**: Create design document with detailed architecture and implementation plan.

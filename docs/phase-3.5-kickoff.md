# Phase 3.5: Architecture Refactor - Kickoff

**Date**: 2025-10-31  
**Status**: In Progress (core services complete; token routes pending)  
**Estimated Duration**: 5 days (39 hours)

---

## Executive Summary

Phase 3.5 refactors existing Phase 1-3 code to follow the layered architecture pattern (Service/Repository) defined in `best-practices.md`. This creates a consistent foundation before adding Phase 4 complexity (Plaid integration).

**Key Decision**: You removed the "do not refactor" line from `best-practices.md`, signaling readiness to align the codebase with the target architecture.

---

## Why Refactor Now?

### The Problem

Current codebase (Phase 1-3) has **fat controllers**:
- Route handlers contain 50-145 lines with multiple responsibilities
- Business logic, validation, and database access mixed together
- Hard to test in isolation (can't unit test without HTTP mocking)
- Hard to reuse (logic tied to HTTP context)
- Will create inconsistent patterns when Phase 4 adds thin controllers

### The Solution

Extract to layered architecture:
```
Route Handler (HTTP)
    ↓
Service (Business Logic)
    ↓
Repository (Data Access)
```

### The Benefits

1. **Consistency**: One pattern across entire codebase
2. **Testability**: Unit test services without HTTP layer
3. **Reusability**: Services usable by webhooks, cron jobs, CLI tools
4. **Maintainability**: Clear separation makes debugging easier
5. **Clean Foundation**: Phase 4+ starts with proper architecture

---

## What We're Refactoring

### Domains in Scope

1. **Tokens** (4 endpoints)
   - POST /v1/tokens (create)
   - GET /v1/tokens (list)
   - PATCH /v1/tokens/:id (update)
   - DELETE /v1/tokens/:id (revoke)

2. **Profiles** (2 endpoints)
   - GET /v1/me (get current profile)
   - PATCH /v1/me (update profile)

3. **Users** (1 endpoint)
   - POST /v1/register (register user)

### Additional Cleanup

- Split rate limit middleware into separate files
- Add Zod validation to profile routes (replace inline validation)

### Out of Scope

- Auth.js handler (third-party integration)
- Health check (simple utility)
- Middleware (already follows SRP, except rate limit split)
- Web client (no changes needed)
- Database schema (no migrations)

---

## Progress Update (2025-10-31)

- Services/repositories for tokens, profiles, and users are implemented with green unit/integration suites.
- Service registry (`apps/api/src/services/index.ts`) is live and consumed by register/profile routes.
- Rate limit middleware split is complete; old monolithic file removed.
- Remaining work: refactor token list/update/revoke routes to use `tokenService`, run full deploy-check, and document outcomes.

---

## The Plan

### Week 1: Core Refactoring (Days 1-7)

**Days 1-3: Tokens Domain**
- Create repository layer (database operations)
- Create service layer (business logic)
- Update route handlers (thin controllers)
- Verify all 64 token tests pass

**Days 4-5: Profiles Domain**
- Create repository and service layers
- Add Zod validation schemas
- Update route handlers
- Verify all profile tests pass

**Days 6-7: Users Domain**
- Create repository and service layers
- Update registration route handler
- Verify all registration tests pass

### Week 2: Cleanup & Verification (Days 8-10)

**Day 8: Middleware Cleanup**
- Split rate limit middleware into separate files
- Update imports across codebase

**Days 9-10: Final Verification**
- Run full test suite (234 tests)
- Run type checking, linting, build
- Manual testing of all flows
- Performance benchmarking
- Update documentation

---

## Success Criteria

### Must Have

- 🚧 Route handlers trending < 30 lines (token list/update/revoke pending)
- 🚧 Business logic consolidated in `packages/core/src/{domain}/` (token routes WIP)
- 🚧 Database access isolated in repository classes (token routes still touch Prisma)
- ✅ Domain errors defined for each domain
- ✅ Dependency injection setup complete
- ✅ 234 tests passing today (re-run planned post-token refactor)
- ✅ TypeScript builds with zero errors
- ✅ Linting passes with zero warnings

### Performance Targets

- API latency increase < 5%
- Build time increase < 10%
- Test execution time increase < 10%

---

## Risk Management

### Low Risk Refactor

**Why Low Risk:**
- All 234 tests provide safety net
- No API contract changes
- No database schema changes
- Can revert entire branch if issues arise
- One domain at a time (incremental)

**Mitigation:**
- Run tests after each domain refactor
- Keep changes purely structural (no behavior changes)
- Feature branch with easy rollback
- Stop immediately if tests fail

---

## Task Breakdown

| Task | Domain | Time | Status |
|------|--------|------|--------|
| 1 | Tokens Repository | 4h | ✅ Complete |
| 2 | Tokens Service | 6h | ✅ Complete |
| 3 | Tokens Route Handlers | 4h | 🚧 In Progress (POST done) |
| 4 | Profiles Repository | 3h | ✅ Complete |
| 5 | Profiles Service | 4h | ✅ Complete |
| 6 | Profiles Route Handlers | 3h | ✅ Complete |
| 7 | Users Repository | 2h | ✅ Complete |
| 8 | Users Service | 3h | ✅ Complete |
| 9 | Users Route Handler | 2h | ✅ Complete |
| 10 | Rate Limit Middleware Split | 2h | ✅ Complete |
| 11 | Dependency Injection Setup | 2h | ✅ Complete |
| 12 | Final Verification | 4h | ⏳ Pending (after token routes) |

**Total**: 39 hours (~5 days at 8 hours/day)

---

## Example: Before & After

### Before (Fat Controller)

```typescript
// apps/api/src/routes/v1/tokens/create.ts (80 lines)

createTokenRoute.post("/", authMiddleware, rateLimitMiddleware, 
  zValidator("json", CreateTokenSchema),
  async (c) => {
    const userId = c.get("userId");
    const { name, scopes, expiresInDays } = c.req.valid("json");

    // ❌ Validation in controller
    if (!validateScopes(scopes)) {
      return c.json({ error: "Invalid scopes" }, 400);
    }

    // ❌ Database access in controller
    const existing = await prisma.apiKey.findUnique({
      where: { userId_name: { userId, name } },
    });

    if (existing) {
      return c.json({ error: "Duplicate name" }, 409);
    }

    // ❌ Business logic in controller
    const token = generateToken();
    const keyHash = hashToken(token);
    const last4 = token.slice(-4);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // ❌ More database access
    const apiKey = await prisma.apiKey.create({
      data: { userId, name, keyHash, last4, scopes, expiresAt },
    });

    // ❌ Audit logging in controller
    authEvents.emit({ type: "token.created", ... });

    return c.json({ token, ...apiKey }, 201);
  }
);
```

### After (Thin Controller)

```typescript
// apps/api/src/routes/v1/tokens/create.ts (20 lines)

import { tokenService } from "../../../services/index.js";

createTokenRoute.post("/", authMiddleware, rateLimitMiddleware,
  zValidator("json", CreateTokenSchema),
  async (c) => {
    const userId = c.get("userId");
    const profileId = c.get("profileId");
    const data = c.req.valid("json");

    try {
      // ✅ Delegate to service layer
      const result = await tokenService.createToken({
        userId,
        profileId,
        ...data,
      });

      return c.json(result, 201);
    } catch (error) {
      // ✅ Map domain errors to HTTP status codes
      if (error instanceof DuplicateTokenNameError) {
        return c.json({ error: error.message }, 409);
      }
      if (error instanceof InvalidScopesError) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }
  }
);
```

**Result**: 120 lines → 20 lines (83% reduction)

---

## Documentation

### Spec Files

- **Requirements**: `.kiro/specs/architecture-refactor/requirements.md`
- **Design**: `.kiro/specs/architecture-refactor/design.md`
- **Tasks**: `.kiro/specs/architecture-refactor/tasks.md`

### Reference Documents

- **Analysis**: `docs/soc-srp-analysis.md` - Detailed SoC/SRP compliance analysis
- **Guidelines**: `.kiro/steering/best-practices.md` - Target architecture patterns
- **Project Plan**: `docs/project_plan.md` - Phase 3.5 added

---

## Next Steps

1. **Start Task 1**: Create tokens repository layer
2. **Run tests frequently**: After each domain refactor
3. **Keep changes focused**: One domain at a time
4. **Document progress**: Update task status as you go
5. **Celebrate milestones**: Each domain completion is a win!

---

## Questions?

- **What if tests fail?** Stop immediately, investigate, fix before proceeding
- **What if it takes longer?** Time-boxed to 2 weeks, can adjust scope if needed
- **What if we find issues?** Revert branch, reassess, adjust plan
- **What about Phase 4?** Starts after Phase 3.5 complete and verified

---

**Ready to Start**: All prerequisites met, can begin Task 1 immediately! 🚀

---

**Last Updated**: 2025-10-31  
**Status**: Ready to Start  
**Next Task**: Task 1 - Tokens Repository Layer

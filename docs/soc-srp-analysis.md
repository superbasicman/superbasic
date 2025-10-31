# Separation of Concerns & Single Responsibility Analysis

**Date**: 2025-10-31  
**Scope**: Phases 1-3 (Monorepo, Authentication, API Keys)  
**Status**: ⚠️ MIXED COMPLIANCE - Current state acceptable, target state defined

---

## Executive Summary

The codebase currently implements business logic directly in route handlers with inline Prisma calls. This is **acceptable for Phase 1-3** as documented in `best-practices.md`. However, it does not yet follow the target layered architecture (Service/Repository pattern) that should be applied to **Phase 4+ features**.

### Key Findings

✅ **What's Working Well:**
- Middleware follows SRP (auth, rate limiting, CORS, scopes)
- Utility functions are focused and single-purpose
- Route handlers are reasonably organized by resource
- No service/repository classes exist (as expected for current phase)

⚠️ **Areas for Improvement (Phase 4+):**
- Route handlers contain business logic + database access (fat controllers)
- No separation between business logic and data access layers
- Domain logic not extracted to `packages/core`
- Functions exceed 50-line guideline in some cases

---

## Detailed Analysis by Layer

### 1. Route Handlers (HTTP Layer)

**Current State**: Fat controllers with inline business logic

#### Token Creation Route (`apps/api/src/routes/v1/tokens/create.ts`)

**Lines of Code**: ~120 lines  
**Responsibilities**: 7+ (violates SRP)

1. ✅ Parse HTTP request (good)
2. ✅ Validate input with Zod (good)
3. ❌ Validate business rules (scope validation)
4. ❌ Check for duplicate names (database query)
5. ❌ Generate token and hash (business logic)
6. ❌ Calculate expiration date (business logic)
7. ❌ Create database record (data access)
8. ❌ Emit audit event (cross-cutting concern)
9. ✅ Format HTTP response (good)

**SoC Violations**:
```typescript
// ❌ Business logic in controller
const token = generateToken();
const last4 = token.slice(-4);
const keyHash = hashToken(token);

// ❌ Database access in controller
const existing = await prisma.apiKey.findUnique({
  where: { userId_name: { userId, name } },
});

// ❌ More database access
const apiKey = await prisma.apiKey.create({
  data: { userId, profileId, name, keyHash, last4, scopes, expiresAt },
});
```

**Target State** (Phase 4+):
```typescript
// ✅ Thin controller - delegates to service layer
createTokenRoute.post("/", authMiddleware, rateLimitMiddleware, 
  zValidator("json", CreateTokenSchema),
  async (c) => {
    const userId = c.get("userId");
    const profileId = c.get("profileId");
    const data = c.req.valid("json");

    try {
      const result = await tokenService.createToken({
        userId,
        profileId,
        ...data,
      });
      return c.json(result, 201);
    } catch (error) {
      if (error instanceof DuplicateTokenNameError) {
        return c.json({ error: error.message }, 409);
      }
      throw error;
    }
  }
);
```

#### Profile Update Route (`apps/api/src/routes/v1/me.ts`)

**Lines of Code**: ~60 lines for PATCH handler  
**Responsibilities**: 5+ (violates SRP)

1. ✅ Parse HTTP request
2. ❌ Validate input (inline validation, not Zod)
3. ❌ Update user name (database access)
4. ❌ Update profile settings (database access)
5. ❌ Fetch updated data (database access)
6. ✅ Format HTTP response

**SoC Violations**:
```typescript
// ❌ Inline validation (should use Zod schema)
if (name !== undefined && (typeof name !== 'string' || name.length === 0 || name.length > 100)) {
  return c.json({ error: 'Name must be between 1 and 100 characters' }, 400);
}

// ❌ Multiple database operations in controller
await prisma.user.update({ where: { id: userId }, data: { name } });
await prisma.profile.update({ where: { id: profileId }, data: { timezone, currency } });
const user = await prisma.user.findUnique({ where: { id: userId }, ... });
```

#### Registration Route (`apps/api/src/routes/v1/register.ts`)

**Lines of Code**: ~50 lines  
**Responsibilities**: 6+ (violates SRP)

1. ✅ Parse HTTP request
2. ❌ Normalize email (business logic)
3. ❌ Check for existing user (database access)
4. ❌ Hash password (business logic)
5. ❌ Create user + profile in transaction (database access)
6. ❌ Emit audit event (cross-cutting concern)
7. ✅ Format HTTP response

**SoC Violations**:
```typescript
// ❌ Business logic in controller
const normalizedEmail = email.toLowerCase().trim();
const hashedPassword = await hashPassword(password);

// ❌ Complex database transaction in controller
const user = await prisma.$transaction(async (tx: any) => {
  const newUser = await tx.user.create({ ... });
  await tx.profile.create({ ... });
  return newUser;
});
```

---

### 2. Business Logic Layer (Services)

**Current State**: ❌ **DOES NOT EXIST**

**Expected Location**: `packages/core/src/{domain}/`

**What Exists**:
```
packages/core/src/
├─ billing/index.ts       # Placeholder only
├─ ledger/index.ts        # Placeholder only
└─ index.ts               # Exports placeholders
```

**What Should Exist (Phase 4+)**:
```
packages/core/src/
├─ tokens/
│  ├─ token-service.ts          # Business logic
│  ├─ token-repository.ts       # Data access
│  ├─ token-errors.ts           # Domain errors
│  └─ token-types.ts            # Domain types
├─ connections/
│  ├─ connection-service.ts
│  ├─ connection-repository.ts
│  └─ ...
└─ profiles/
   ├─ profile-service.ts
   ├─ profile-repository.ts
   └─ ...
```

**Impact**: All business logic is currently embedded in route handlers, making it:
- Hard to test in isolation
- Hard to reuse across different endpoints
- Hard to maintain as complexity grows

---

### 3. Data Access Layer (Repositories)

**Current State**: ❌ **DOES NOT EXIST**

**What Exists**: Direct Prisma calls in route handlers

**Examples of Inline Data Access**:
```typescript
// Token creation - direct Prisma in controller
const existing = await prisma.apiKey.findUnique({ ... });
const apiKey = await prisma.apiKey.create({ ... });

// Profile update - direct Prisma in controller
await prisma.user.update({ ... });
await prisma.profile.update({ ... });

// Registration - direct Prisma in controller
const existing = await prisma.user.findUnique({ ... });
const user = await prisma.$transaction(async (tx) => { ... });
```

**Target State** (Phase 4+):
```typescript
// packages/core/src/tokens/token-repository.ts
export class TokenRepository {
  constructor(private prisma: PrismaClient) {}

  async existsByUserAndName(userId: string, name: string): Promise<boolean> {
    const count = await this.prisma.apiKey.count({
      where: { userId, name, revokedAt: null },
    });
    return count > 0;
  }

  async create(data: CreateTokenData): Promise<ApiKey> {
    return this.prisma.apiKey.create({ data });
  }
}
```

---

### 4. Middleware Layer

**Current State**: ✅ **FOLLOWS SRP WELL**

#### Auth Middleware (`apps/api/src/middleware/auth-unified.ts`)

**Responsibilities**: 1 (good!)
- Determine authentication method (Bearer vs Session)
- Delegate to appropriate auth handler

**Lines of Code**: ~30 lines  
**SRP Compliance**: ✅ Excellent

#### Scope Middleware (`apps/api/src/middleware/scopes.ts`)

**Responsibilities**: 1 (good!)
- Validate token scopes for PAT auth
- Bypass for session auth

**Lines of Code**: ~60 lines  
**SRP Compliance**: ✅ Good

#### Rate Limit Middleware (`apps/api/src/middleware/rate-limit.ts`)

**Responsibilities**: 4 (acceptable for middleware)
- Auth rate limiting (10/min per IP)
- Token creation rate limiting (10/hour per user)
- Magic link rate limiting (3/hour per email)
- Failed auth tracking

**Lines of Code**: ~180 lines  
**SRP Compliance**: ⚠️ Could be split into separate files

**Recommendation**: Split into separate middleware files:
```
middleware/
├─ rate-limit/
│  ├─ auth-rate-limit.ts
│  ├─ token-rate-limit.ts
│  ├─ magic-link-rate-limit.ts
│  └─ failed-auth-tracking.ts
```

---

### 5. Utility Functions

**Current State**: ✅ **FOLLOWS SRP WELL**

#### PAT Utilities (`packages/auth/src/pat.ts`)

**Functions**:
- `generateToken()` - Generate secure token (1 responsibility) ✅
- `hashToken()` - Hash token with SHA-256 (1 responsibility) ✅
- `verifyToken()` - Verify token against hash (1 responsibility) ✅
- `isValidTokenFormat()` - Validate token format (1 responsibility) ✅
- `extractTokenFromHeader()` - Extract token from header (1 responsibility) ✅

**Lines of Code**: ~100 lines total  
**SRP Compliance**: ✅ Excellent - each function has one clear purpose

#### RBAC Utilities (`packages/auth/src/rbac.ts`)

**Functions** (inferred from exports):
- `isValidScope()` - Validate single scope (1 responsibility) ✅
- `validateScopes()` - Validate array of scopes (1 responsibility) ✅
- `hasScope()` - Check if scope exists (1 responsibility) ✅
- `hasAllScopes()` - Check if all scopes exist (1 responsibility) ✅
- `hasAnyScope()` - Check if any scope exists (1 responsibility) ✅

**SRP Compliance**: ✅ Excellent

---

## Function Length Analysis

### Functions Exceeding 50-Line Guideline

1. **Token Creation Handler** (`apps/api/src/routes/v1/tokens/create.ts`)
   - Lines: ~80 lines (handler body)
   - Reason: Multiple responsibilities (validation, DB access, business logic)
   - Recommendation: Extract to service layer in Phase 4+

2. **Profile Update Handler** (`apps/api/src/routes/v1/me.ts`)
   - Lines: ~60 lines (PATCH handler body)
   - Reason: Multiple DB operations and validation
   - Recommendation: Extract to service layer in Phase 4+

3. **Rate Limit Middleware** (`apps/api/src/middleware/rate-limit.ts`)
   - Lines: ~180 lines total (multiple functions)
   - Reason: Multiple rate limiting strategies in one file
   - Recommendation: Split into separate files

---

## Compliance Summary

### By Best Practice Guideline

| Guideline | Current State | Target State | Phase 4+ Action |
|-----------|---------------|--------------|-----------------|
| **Layered Architecture** | ❌ Not implemented | ✅ Service/Repository pattern | Implement for new features |
| **Thin Controllers** | ❌ Fat controllers | ✅ Delegate to services | Refactor route handlers |
| **Service Layer** | ❌ Does not exist | ✅ Business logic in services | Create service classes |
| **Repository Layer** | ❌ Does not exist | ✅ Data access in repositories | Create repository classes |
| **SRP - Route Handlers** | ❌ Multiple responsibilities | ✅ Single responsibility | Extract logic to services |
| **SRP - Middleware** | ✅ Good | ✅ Good | Maintain current approach |
| **SRP - Utilities** | ✅ Excellent | ✅ Excellent | Maintain current approach |
| **Function Length** | ⚠️ Some exceed 50 lines | ✅ Under 50 lines | Extract helper functions |
| **Domain Logic Location** | ❌ In route handlers | ✅ In packages/core | Move to core package |

---

## Recommendations

### Immediate Actions (Phase 4+)

1. **Create Service Layer for New Features**
   - Start with Plaid connections (Phase 4)
   - Implement `ConnectionService` and `ConnectionRepository`
   - Use as template for future features

2. **Split Rate Limit Middleware**
   - Create separate files for each rate limiting strategy
   - Improves maintainability and testability

3. **Add Zod Validation to Profile Routes**
   - Replace inline validation with Zod schemas
   - Consistent with other routes

### Long-Term Actions (Future Phases)

4. **Refactor Existing Routes** (only if explicitly requested)
   - Extract token management to service layer
   - Extract profile management to service layer
   - Extract registration logic to service layer

5. **Create Domain Error Classes**
   - Define custom errors for business rule violations
   - Improves error handling and debugging

6. **Implement Dependency Injection**
   - Create service registry in `apps/api/src/services/index.ts`
   - Inject dependencies for better testability

---

## Conclusion

The current codebase (Phase 1-3) **does not follow** the Separation of Concerns and Single Responsibility Principle guidelines outlined in `best-practices.md`. However, this is **acceptable and documented** as the current state.

The `best-practices.md` document clearly states:

> **⚠️ ASPIRATIONAL GUIDANCE**: The layered architecture described below is the target state for new features and major refactors. The current codebase (Phase 3 and earlier) implements business logic directly in route handlers with inline Prisma calls. This is acceptable for existing code.

### Key Takeaways

1. **Current state is acceptable** - Phase 1-3 code works and is tested
2. **Target state is defined** - Service/Repository pattern for Phase 4+
3. **No refactoring needed** - Unless explicitly requested by user
4. **Apply pattern to new features** - Start with Phase 4 (Plaid integration)

### Next Steps

When implementing Phase 4 (Plaid Bank Connections):
- Create `packages/core/src/connections/` with service and repository
- Implement thin controllers in `apps/api/src/routes/v1/connections/`
- Use as template for all future features
- Document the pattern for team reference

---

**Last Updated**: 2025-10-31  
**Reviewed By**: Kiro AI Assistant  
**Next Review**: After Phase 4 implementation

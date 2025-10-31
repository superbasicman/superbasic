# Phase 3.5: Architecture Refactor - Design Document

**Phase**: 3.5 (Pre-Phase 4 Cleanup)  
**Status**: Draft  
**Owner**: Engineering Team  
**Created**: 2025-10-31

---

## Architecture Overview

### Current State (Phase 1-3)

```
apps/api/src/routes/v1/
├─ tokens/
│  ├─ create.ts    [120 lines] ❌ Fat controller
│  ├─ list.ts      [45 lines] ⚠️  Medium controller
│  ├─ update.ts    [80 lines] ❌ Fat controller
│  └─ revoke.ts    [55 lines] ⚠️  Medium controller
├─ me.ts           [145 lines] ❌ Fat controller (2 handlers, 65 + 80 lines)
└─ register.ts     [60 lines] ⚠️  Medium controller

packages/core/src/
├─ billing/        [Placeholder only]
└─ ledger/         [Placeholder only]
```

**Problems:**
- Business logic in route handlers
- Database access in route handlers
- Hard to test in isolation
- Hard to reuse logic
- Violates Single Responsibility Principle

### Target State (Phase 3.5)

```
apps/api/src/routes/v1/
├─ tokens/
│  ├─ create.ts    [20 lines] ✅ Thin controller
│  ├─ list.ts      [15 lines] ✅ Thin controller
│  ├─ update.ts    [20 lines] ✅ Thin controller
│  └─ revoke.ts    [15 lines] ✅ Thin controller
├─ me.ts           [40 lines] ✅ Thin controller (2 handlers)
└─ register.ts     [20 lines] ✅ Thin controller

packages/core/src/
├─ tokens/
│  ├─ token-service.ts       [Business logic]
│  ├─ token-repository.ts    [Data access]
│  ├─ token-errors.ts        [Domain errors]
│  ├─ token-types.ts         [Domain types]
│  └─ __tests__/
│     ├─ token-service.test.ts
│     └─ token-repository.test.ts
├─ profiles/
│  ├─ profile-service.ts
│  ├─ profile-repository.ts
│  ├─ profile-errors.ts
│  ├─ profile-types.ts
│  └─ __tests__/
├─ users/
│  ├─ user-service.ts
│  ├─ user-repository.ts
│  ├─ user-errors.ts
│  ├─ user-types.ts
│  └─ __tests__/
└─ index.ts                  [Public exports]

apps/api/src/services/
└─ index.ts                  [Dependency injection]
```

**Benefits:**
- Clear separation of concerns
- Testable business logic
- Reusable services
- Consistent patterns
- Follows Single Responsibility Principle

---

## Layered Architecture

### Layer 1: HTTP Layer (Route Handlers)

**Responsibility**: Parse HTTP requests, call services, format HTTP responses

**Pattern**:
```typescript
// apps/api/src/routes/v1/tokens/create.ts
import { tokenService } from "../../../services/index.js";

createTokenRoute.post(
  "/",
  authMiddleware,
  rateLimitMiddleware,
  zValidator("json", CreateTokenSchema),
  async (c) => {
    // 1. Extract context
    const userId = c.get("userId");
    const profileId = c.get("profileId");
    const data = c.req.valid("json");

    try {
      // 2. Call service
      const result = await tokenService.createToken({
        userId,
        profileId,
        ...data,
      });

      // 3. Format response
      return c.json(result, 201);
    } catch (error) {
      // 4. Handle domain errors
      if (error instanceof DuplicateTokenNameError) {
        return c.json({ error: error.message }, 409);
      }
      if (error instanceof InvalidScopesError) {
        return c.json({ error: error.message }, 400);
      }
      throw error; // Let global error handler catch
    }
  }
);
```

**Rules**:
- No business logic
- No database access
- No complex validation (use Zod)
- Handle domain errors → HTTP status codes
- Keep under 30 lines

### Layer 2: Business Logic Layer (Services)

**Responsibility**: Implement business rules, orchestrate repositories, emit events

**Pattern**:
```typescript
// packages/core/src/tokens/token-service.ts
export class TokenService {
  constructor(
    private tokenRepo: TokenRepository,
    private auditLogger: AuditLogger
  ) {}

  async createToken(params: CreateTokenParams): Promise<CreateTokenResult> {
    // 1. Validate business rules
    this.validateTokenParams(params);

    // 2. Check business constraints
    const isDuplicate = await this.tokenRepo.existsByUserAndName(
      params.userId,
      params.name
    );
    if (isDuplicate) {
      throw new DuplicateTokenNameError(params.name);
    }

    // 3. Execute business logic
    const token = generateToken();
    const keyHash = hashToken(token);
    const last4 = token.slice(-4);
    const expiresAt = this.calculateExpiration(params.expiresInDays);

    // 4. Persist via repository
    const apiKey = await this.tokenRepo.create({
      userId: params.userId,
      profileId: params.profileId,
      name: params.name,
      keyHash,
      last4,
      scopes: params.scopes,
      expiresAt,
    });

    // 5. Emit domain events
    await this.auditLogger.logTokenCreated({
      tokenId: apiKey.id,
      userId: params.userId,
      tokenName: params.name,
      scopes: params.scopes,
    });

    // 6. Return domain object
    return {
      token, // Plaintext (shown once)
      apiKey: this.mapToTokenResponse(apiKey),
    };
  }

  private validateTokenParams(params: CreateTokenParams): void {
    if (!validateScopes(params.scopes)) {
      throw new InvalidScopesError(params.scopes);
    }
    if (params.expiresInDays < 1 || params.expiresInDays > 365) {
      throw new InvalidExpirationError(params.expiresInDays);
    }
  }

  private calculateExpiration(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  private mapToTokenResponse(apiKey: ApiKey): TokenResponse {
    return {
      id: apiKey.id,
      name: apiKey.name,
      scopes: apiKey.scopes as string[],
      createdAt: apiKey.createdAt.toISOString(),
      expiresAt: apiKey.expiresAt?.toISOString() ?? null,
      maskedToken: `sbf_****${apiKey.last4}`,
    };
  }
}
```

**Rules**:
- No HTTP concerns (no `c.json()`, no status codes)
- No direct database access (use repositories)
- Throw domain errors (not HTTP errors)
- Return domain objects (not HTTP responses)
- Keep methods focused (single responsibility)

### Layer 3: Data Access Layer (Repositories)

**Responsibility**: Pure database operations (CRUD only)

**Pattern**:
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
    return this.prisma.apiKey.create({
      data: {
        userId: data.userId,
        profileId: data.profileId,
        name: data.name,
        keyHash: data.keyHash,
        last4: data.last4,
        scopes: data.scopes,
        expiresAt: data.expiresAt,
      },
    });
  }

  async findById(id: string): Promise<ApiKey | null> {
    return this.prisma.apiKey.findUnique({ where: { id } });
  }

  async findActiveByUserId(userId: string): Promise<ApiKey[]> {
    return this.prisma.apiKey.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async update(id: string, data: UpdateTokenData): Promise<ApiKey> {
    return this.prisma.apiKey.update({
      where: { id },
      data,
    });
  }

  async revoke(id: string): Promise<void> {
    await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }
}
```

**Rules**:
- No business logic
- No validation (except database constraints)
- Pure Prisma operations
- Return database entities
- One method = one database operation

---

## Domain Errors

### Error Hierarchy

```typescript
// packages/core/src/tokens/token-errors.ts

export class TokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenError";
  }
}

export class DuplicateTokenNameError extends TokenError {
  constructor(name: string) {
    super(`Token name "${name}" already exists`);
    this.name = "DuplicateTokenNameError";
  }
}

export class InvalidScopesError extends TokenError {
  constructor(scopes: string[]) {
    super(`Invalid scopes: ${scopes.join(", ")}`);
    this.name = "InvalidScopesError";
  }
}

export class InvalidExpirationError extends TokenError {
  constructor(days: number) {
    super(`Expiration must be between 1-365 days, got ${days}`);
    this.name = "InvalidExpirationError";
  }
}

export class TokenNotFoundError extends TokenError {
  constructor(id: string) {
    super(`Token not found: ${id}`);
    this.name = "TokenNotFoundError";
  }
}

export class TokenRevokedError extends TokenError {
  constructor(id: string) {
    super(`Token has been revoked: ${id}`);
    this.name = "TokenRevokedError";
  }
}
```

### Error Mapping (HTTP Layer)

```typescript
// apps/api/src/routes/v1/tokens/create.ts

try {
  const result = await tokenService.createToken(params);
  return c.json(result, 201);
} catch (error) {
  // Map domain errors to HTTP status codes
  if (error instanceof DuplicateTokenNameError) {
    return c.json({ error: error.message }, 409);
  }
  if (error instanceof InvalidScopesError) {
    return c.json({ error: error.message }, 400);
  }
  if (error instanceof InvalidExpirationError) {
    return c.json({ error: error.message }, 400);
  }
  // Let global error handler catch unexpected errors
  throw error;
}
```

---

## Dependency Injection

### Service Registry

```typescript
// apps/api/src/services/index.ts

import { prisma } from "@repo/database";
import { authEvents } from "@repo/auth";
import {
  TokenRepository,
  TokenService,
  ProfileRepository,
  ProfileService,
  UserRepository,
  UserService,
} from "@repo/core";

// Create repository instances
export const tokenRepository = new TokenRepository(prisma);
export const profileRepository = new ProfileRepository(prisma);
export const userRepository = new UserRepository(prisma);

// Create service instances with dependencies
export const tokenService = new TokenService(tokenRepository, authEvents);
export const profileService = new ProfileService(
  profileRepository,
  userRepository
);
export const userService = new UserService(
  userRepository,
  profileRepository,
  authEvents
);
```

### Usage in Route Handlers

```typescript
// apps/api/src/routes/v1/tokens/create.ts
import { tokenService } from "../../../services/index.js";

createTokenRoute.post("/", async (c) => {
  const result = await tokenService.createToken(params);
  return c.json(result, 201);
});
```

---

## Domain Types

### Token Domain

```typescript
// packages/core/src/tokens/token-types.ts

export interface CreateTokenParams {
  userId: string;
  profileId?: string;
  name: string;
  scopes: string[];
  expiresInDays: number;
}

export interface CreateTokenData {
  userId: string;
  profileId: string | null;
  name: string;
  keyHash: string;
  last4: string;
  scopes: string[];
  expiresAt: Date;
}

export interface CreateTokenResult {
  token: string; // Plaintext (shown once)
  apiKey: TokenResponse;
}

export interface TokenResponse {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  maskedToken: string;
}

export interface UpdateTokenParams {
  id: string;
  userId: string;
  name: string;
}

export interface UpdateTokenData {
  name: string;
}
```

### Profile Domain

```typescript
// packages/core/src/profiles/profile-types.ts

export interface GetProfileParams {
  userId: string;
}

export interface ProfileResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
    profile: {
      id: string;
      timezone: string;
      currency: string;
    } | null;
  };
}

export interface UpdateProfileParams {
  userId: string;
  profileId?: string;
  name?: string;
  timezone?: string;
  currency?: string;
}

export interface UpdateProfileData {
  name?: string;
  timezone?: string;
  currency?: string;
}
```

### User Domain

```typescript
// packages/core/src/users/user-types.ts

export interface RegisterUserParams {
  email: string;
  password: string;
  name?: string;
}

export interface RegisterUserResult {
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
  };
}

export interface CreateUserData {
  email: string;
  password: string;
  name: string | null;
}

export interface CreateProfileData {
  userId: string;
  timezone: string;
  currency: string;
}
```

---

## Testing Strategy

### Unit Tests (Service Layer)

**Test services with mocked repositories:**

```typescript
// packages/core/src/tokens/__tests__/token-service.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TokenService } from "../token-service.js";
import { TokenRepository } from "../token-repository.js";
import { DuplicateTokenNameError, InvalidScopesError } from "../token-errors.js";

describe("TokenService", () => {
  let tokenService: TokenService;
  let mockTokenRepo: TokenRepository;
  let mockAuditLogger: any;

  beforeEach(() => {
    // Mock repository
    mockTokenRepo = {
      existsByUserAndName: vi.fn(),
      create: vi.fn(),
    } as any;

    // Mock audit logger
    mockAuditLogger = {
      logTokenCreated: vi.fn(),
    };

    tokenService = new TokenService(mockTokenRepo, mockAuditLogger);
  });

  describe("createToken", () => {
    it("should create token successfully", async () => {
      // Arrange
      mockTokenRepo.existsByUserAndName = vi.fn().mockResolvedValue(false);
      mockTokenRepo.create = vi.fn().mockResolvedValue({
        id: "token-123",
        name: "My Token",
        scopes: ["read:profile"],
        createdAt: new Date(),
        expiresAt: new Date(),
        last4: "abcd",
      });

      // Act
      const result = await tokenService.createToken({
        userId: "user-123",
        profileId: "profile-123",
        name: "My Token",
        scopes: ["read:profile"],
        expiresInDays: 30,
      });

      // Assert
      expect(result.token).toMatch(/^sbf_/);
      expect(result.apiKey.name).toBe("My Token");
      expect(mockTokenRepo.existsByUserAndName).toHaveBeenCalledWith(
        "user-123",
        "My Token"
      );
      expect(mockAuditLogger.logTokenCreated).toHaveBeenCalled();
    });

    it("should throw DuplicateTokenNameError if name exists", async () => {
      // Arrange
      mockTokenRepo.existsByUserAndName = vi.fn().mockResolvedValue(true);

      // Act & Assert
      await expect(
        tokenService.createToken({
          userId: "user-123",
          profileId: "profile-123",
          name: "Duplicate",
          scopes: ["read:profile"],
          expiresInDays: 30,
        })
      ).rejects.toThrow(DuplicateTokenNameError);
    });

    it("should throw InvalidScopesError if scopes invalid", async () => {
      // Act & Assert
      await expect(
        tokenService.createToken({
          userId: "user-123",
          profileId: "profile-123",
          name: "My Token",
          scopes: ["invalid:scope"],
          expiresInDays: 30,
        })
      ).rejects.toThrow(InvalidScopesError);
    });
  });
});
```

### Integration Tests (Repository Layer)

**Test repositories with test database:**

```typescript
// packages/core/src/tokens/__tests__/token-repository.test.ts

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@repo/database";
import { TokenRepository } from "../token-repository.js";

describe("TokenRepository", () => {
  let tokenRepo: TokenRepository;
  let testUserId: string;

  beforeEach(async () => {
    tokenRepo = new TokenRepository(prisma);

    // Create test user
    const user = await prisma.user.create({
      data: {
        email: "test@example.com",
        password: "hashed",
      },
    });
    testUserId = user.id;
  });

  afterEach(async () => {
    // Cleanup
    await prisma.apiKey.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
  });

  describe("existsByUserAndName", () => {
    it("should return false if token does not exist", async () => {
      const exists = await tokenRepo.existsByUserAndName(
        testUserId,
        "Nonexistent"
      );
      expect(exists).toBe(false);
    });

    it("should return true if token exists", async () => {
      // Create token
      await tokenRepo.create({
        userId: testUserId,
        profileId: null,
        name: "Existing",
        keyHash: "hash",
        last4: "abcd",
        scopes: ["read:profile"],
        expiresAt: new Date(),
      });

      const exists = await tokenRepo.existsByUserAndName(testUserId, "Existing");
      expect(exists).toBe(true);
    });
  });

  describe("create", () => {
    it("should create token successfully", async () => {
      const token = await tokenRepo.create({
        userId: testUserId,
        profileId: null,
        name: "Test Token",
        keyHash: "hash123",
        last4: "xyz",
        scopes: ["read:profile", "write:profile"],
        expiresAt: new Date(),
      });

      expect(token.id).toBeDefined();
      expect(token.name).toBe("Test Token");
      expect(token.scopes).toEqual(["read:profile", "write:profile"]);
    });
  });
});
```

### Existing Integration Tests

**Update imports, verify behavior unchanged:**

```typescript
// apps/api/src/routes/v1/__tests__/tokens.test.ts

// Before:
// Direct Prisma calls in route handler

// After:
// Route handler calls service, behavior identical
// Tests should pass without modification (except imports)

describe("POST /v1/tokens", () => {
  it("should create token successfully", async () => {
    const response = await request(app)
      .post("/v1/tokens")
      .set("Cookie", sessionCookie)
      .send({
        name: "Test Token",
        scopes: ["read:profile"],
        expiresInDays: 30,
      });

    expect(response.status).toBe(201);
    expect(response.body.token).toMatch(/^sbf_/);
    expect(response.body.name).toBe("Test Token");
  });
});
```

---

## Migration Plan

### Phase 1: Tokens Domain (Days 1-3)

**Day 1: Repository Layer**
1. Create `packages/core/src/tokens/token-repository.ts`
2. Extract database operations from route handlers
3. Write integration tests for repository
4. Verify tests pass

**Day 2: Service Layer**
1. Create `packages/core/src/tokens/token-service.ts`
2. Extract business logic from route handlers
3. Create `packages/core/src/tokens/token-errors.ts`
4. Create `packages/core/src/tokens/token-types.ts`
5. Write unit tests for service
6. Verify tests pass

**Day 3: Route Handlers**
1. Create `apps/api/src/services/index.ts` (DI setup)
2. Update route handlers to use service
3. Verify all 64 token tests pass
4. Manual testing of token flows

### Phase 2: Profiles Domain (Days 4-5)

**Day 4: Repository & Service**
1. Create `packages/core/src/profiles/` structure
2. Extract repository methods
3. Extract service methods
4. Create errors and types
5. Write unit and integration tests

**Day 5: Route Handlers & Validation**
1. Add Zod validation schemas for profile routes
2. Update route handlers to use service
3. Verify all profile tests pass
4. Manual testing of profile flows

### Phase 3: Users Domain (Days 6-7)

**Day 6: Repository & Service**
1. Create `packages/core/src/users/` structure
2. Extract registration logic to service
3. Create errors and types
4. Write unit and integration tests

**Day 7: Route Handler**
1. Update registration route to use service
2. Verify registration tests pass
3. Manual testing of registration flow

### Phase 4: Middleware Cleanup (Day 8)

**Day 8: Rate Limit Middleware**
1. Create `apps/api/src/middleware/rate-limit/` directory
2. Split into separate files:
   - `auth-rate-limit.ts`
   - `token-rate-limit.ts`
   - `magic-link-rate-limit.ts`
   - `index.ts` (exports)
3. Update imports across codebase
4. Verify all middleware tests pass

### Phase 5: Final Verification (Days 9-10)

**Day 9: Testing & Documentation**
1. Run full test suite (234 tests)
2. Run type checking (`pnpm typecheck`)
3. Run linting (`pnpm lint`)
4. Run build (`pnpm build`)
5. Manual testing of all flows
6. Update documentation

**Day 10: Review & Merge**
1. Code review
2. Performance benchmarks
3. Final testing
4. Merge to main branch
5. Deploy to preview environment
6. Monitor for issues

---

## Rollback Plan

If issues arise during refactor:

1. **Immediate Rollback**: Revert entire feature branch
2. **Investigate**: Debug issues in separate branch
3. **Fix**: Address root cause
4. **Retry**: Attempt refactor again with fixes

**Rollback Triggers**:
- Any test failures
- TypeScript errors
- Performance degradation > 5%
- Build time increase > 10%
- Critical bugs discovered

---

## Success Metrics

### Code Quality Metrics

- **Route Handler Length**: Average < 25 lines (currently 60-80 lines)
- **Function Complexity**: Cyclomatic complexity < 10 per function
- **Test Coverage**: Maintain 100% of existing coverage
- **Type Safety**: Zero TypeScript errors

### Performance Metrics

- **API Latency**: < 5% increase acceptable
- **Build Time**: < 10% increase acceptable
- **Test Execution Time**: < 10% increase acceptable

### Maintainability Metrics

- **Code Duplication**: Reduced by extracting common logic
- **Separation of Concerns**: 100% compliance with layered architecture
- **Single Responsibility**: Each function has one clear purpose

---

## References

- **Analysis**: `docs/soc-srp-analysis.md`
- **Guidelines**: `.kiro/steering/best-practices.md`
- **Requirements**: `.kiro/specs/architecture-refactor/requirements.md`
- **Tasks**: `.kiro/specs/architecture-refactor/tasks.md` (to be created)

---

**Next Steps**: Create tasks document with detailed implementation checklist.

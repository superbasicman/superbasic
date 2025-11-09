# Architecture Overview & Code Organization

## Organization Principles

- Keep domain logic in `packages/core` and surface it via pure functions; apps consume only those APIs.
- Restrict `apps/web` to SDK/API calls—lint or CI should fail on direct DB imports.
- Favor composable Hono middlewares for CORS, rate limits, and auth; avoid bespoke wrappers unless necessary.
- Centralize secret parsing in server-only modules (`apps/api`, `packages/auth`, etc.); never surface secrets in `apps/web` or anything shipped to the browser.

## Layered Architecture Pattern (Target State)

Follow a strict three-layer architecture for API features:

```text
┌─────────────────────────────────────────────────────────┐
│ apps/api/src/routes/v1/                                 │
│ HTTP LAYER (Controllers)                                │
│ - Parse/validate HTTP requests                          │
│ - Call service layer methods                            │
│ - Format HTTP responses                                 │
│ - Handle HTTP-specific errors (4xx, 5xx)                │
│ - Apply middleware (auth, rate limits, validation)      │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ packages/core/src/{domain}/                            │
│ BUSINESS LOGIC LAYER (Services)                        │
│ - Implement business rules and workflows               │
│ - Orchestrate multiple repository calls                │
│ - Validate business constraints                        │
│ - Emit domain events for audit logging                 │
│ - Return domain objects (not HTTP responses)           │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ packages/core/src/{domain}/                            │
│ DATA ACCESS LAYER (Repositories)                       │
│ - Pure Prisma operations (CRUD only)                   │
│ - No business logic or validation                      │
│ - Return database entities                             │
│ - Handle database-specific errors                      │
└─────────────────────────────────────────────────────────┘
```

## Single Responsibility Principle (SRP)

**Each function should have ONE clear responsibility:**

- **Route handlers**: Parse request → Call service → Format response  
- **Services**: Implement ONE business operation (e.g. `createToken`, `syncTransactions`, `calculateBudget`)  
- **Repositories**: Perform ONE database operation (`findById`, `create`, `update`, `delete`)  
- **Utilities**: Perform ONE pure function (`hashToken`, `formatCurrency`, `validateEmail`)

**Keep functions focused and short:**

- Aim for functions under ~50 lines (ideally 20–30).
- If a function does multiple things, extract helper functions.
- Use early returns to reduce nesting.
- Extract complex conditionals into named boolean helpers.

## Route Handler Pattern (HTTP Layer)

**Route handlers should be thin controllers:**

```typescript
// ✅ GOOD - Thin controller
export const createTokenRoute = new Hono<AuthContext>();

createTokenRoute.post(
  "/",
  authMiddleware,
  rateLimitMiddleware,
  zValidator("json", CreateTokenSchema),
  async (c) => {
    const userId = c.get("userId");
    const profileId = c.get("profileId");
    const data = c.req.valid("json");

    try {
      // Call service layer - business logic lives there
      const result = await tokenService.createToken({
        userId,
        profileId,
        ...data,
      });

      // Format HTTP response
      return c.json(result, 201);
    } catch (error) {
      // Handle domain errors → HTTP errors
      if (error instanceof DuplicateTokenNameError) {
        return c.json({ error: error.message }, 409);
      }
      if (error instanceof InvalidScopesError) {
        return c.json({ error: error.message }, 400);
      }
      throw error; // Let global error handler catch unexpected errors
    }
  }
);
```

```typescript
// ❌ BAD - Fat controller with business logic and DB access
createTokenRoute.post("/", async (c) => {
  const userId = c.get("userId");
  const { name, scopes, expiresInDays } = await c.req.json();

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
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  // ❌ More database access
  const apiKey = await prisma.apiKey.create({
    data: { userId, name, keyHash, scopes, expiresAt },
  });

  return c.json({ token, ...apiKey }, 201);
});
```

## Service Layer Pattern (Business Logic)

**Services implement business operations as pure functions or classes:**

```typescript
// packages/core/src/tokens/token-service.ts

/**
 * Token management service
 * Implements business logic for API token operations
 */
export class TokenService {
  constructor(
    private tokenRepo: TokenRepository,
    private auditLogger: AuditLogger
  ) {}

  /**
   * Create a new API token
   * Business rules:
   * - Token names must be unique per user
   * - Scopes must be valid
   * - Expiration must be between 1–365 days
   */
  async createToken(params: CreateTokenParams): Promise<CreateTokenResult> {
    // Validate business rules
    this.validateTokenParams(params);

    // Check for duplicate name
    const isDuplicate = await this.tokenRepo.existsByUserAndName(
      params.userId,
      params.name
    );

    if (isDuplicate) {
      throw new DuplicateTokenNameError(params.name);
    }

    // Generate token and hash
    const token = generateToken();
    const keyHash = hashToken(token);
    const last4 = token.slice(-4);

    // Calculate expiration
    const expiresAt = this.calculateExpiration(params.expiresInDays);

    // Create token record
    const apiKey = await this.tokenRepo.create({
      userId: params.userId,
      profileId: params.profileId,
      name: params.name,
      keyHash,
      last4,
      scopes: params.scopes,
      expiresAt,
    });

    // Emit audit event
    await this.auditLogger.logTokenCreated({
      tokenId: apiKey.id,
      userId: params.userId,
      tokenName: params.name,
      scopes: params.scopes,
    });

    // Return result with plaintext token (shown once)
    return {
      token, // Plaintext
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

**Or use functional style for simpler operations:**

```typescript
// packages/core/src/tokens/token-operations.ts

export async function createToken(
  params: CreateTokenParams,
  deps: { tokenRepo: TokenRepository; auditLogger: AuditLogger }
): Promise<CreateTokenResult> {
  // Same logic as class-based approach
  // Use this style for simpler, stateless operations
}
```

## Repository Pattern (Data Access)

**Repositories handle ONLY database operations:**

```typescript
// packages/core/src/tokens/token-repository.ts

/**
 * Token data access layer
 * Pure Prisma operations with no business logic
 */
export class TokenRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Check if a token with the given name exists for a user
   */
  async existsByUserAndName(userId: string, name: string): Promise<boolean> {
    const count = await this.prisma.apiKey.count({
      where: {
        userId,
        name,
        revokedAt: null, // Only check active tokens
      },
    });
    return count > 0;
  }

  /**
   * Create a new token record
   */
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

  /**
   * Find token by ID
   */
  async findById(id: string): Promise<ApiKey | null> {
    return this.prisma.apiKey.findUnique({
      where: { id },
    });
  }

  /**
   * Find all active tokens for a user
   */
  async findActiveByUserId(userId: string): Promise<ApiKey[]> {
    return this.prisma.apiKey.findMany({
      where: {
        userId,
        revokedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Soft delete token by setting revokedAt timestamp
   */
  async revoke(id: string): Promise<void> {
    await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }
}
```

## Domain Errors Pattern

**Create custom error classes for business rule violations:**

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

export class TokenNotFoundError extends TokenError {
  constructor(id: string) {
    super(`Token not found: ${id}`);
    this.name = "TokenNotFoundError";
  }
}
```

## Package Structure for Domain Logic

```text
packages/core/src/
├─ tokens/
│  ├─ token-service.ts             # Business logic
│  ├─ token-repository.ts          # Data access
│  ├─ token-errors.ts              # Domain errors
│  ├─ token-types.ts               # Domain types
│  ├─ index.ts                     # Public exports
│  └─ __tests__/
│     ├─ token-service.test.ts     # Unit tests (no DB)
│     └─ token-repository.test.ts  # Integration tests (with DB)
├─ connections/
│  ├─ connection-service.ts
│  ├─ connection-repository.ts
│  └─ ...
├─ transactions/
│  ├─ transaction-service.ts
│  ├─ transaction-repository.ts
│  └─ ...
└─ budgets/
   ├─ budget-service.ts
   ├─ budget-repository.ts
   └─ ...
```

## Dependency Injection Pattern (Target State)

**Use constructor injection for testability in new features:**

```typescript
// apps/api/src/services/index.ts (does not exist yet - create when needed)

import { prisma } from "@repo/database";
import { ConnectionRepository, ConnectionService } from "@repo/core";
import { auditLogger } from "@repo/observability";

// Create repository instances
export const connectionRepository = new ConnectionRepository(prisma);

// Create service instances with dependencies
export const connectionService = new ConnectionService(
  connectionRepository,
  auditLogger
);
```

```typescript
// apps/api/src/routes/v1/connections/create.ts (example for Phase 4+)

import { connectionService } from "../../../services/index.js";

createConnectionRoute.post("/", async (c) => {
  // Use injected service
  const result = await connectionService.createConnection({ /* ... */ });
  return c.json(result, 201);
});
```

## When to Deviate from This Pattern

**For new features ask: “Will this need business logic later?”**

- If **yes**, use the full layered pattern from the start.
- If **no**, keep it simple but document the decision and rationale.

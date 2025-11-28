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

**Services implement business operations as pure functions or classes (generic example):**

```typescript
export class ExampleService {
  constructor(
    private repo: ExampleRepository,
    private auditLogger: AuditLogger
  ) {}

  async createExample(params: CreateExampleParams): Promise<ExampleResult> {
    const record = await this.repo.create(params);
    await this.auditLogger.logExampleCreated({ id: record.id });
    return mapToDto(record);
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
export class ExampleRepository {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateExampleData): Promise<ExampleRecord> {
    return this.prisma.example.create({ data });
  }

  async findById(id: string): Promise<ExampleRecord | null> {
    return this.prisma.example.findUnique({ where: { id } });
  }
}
```

## Domain Errors Pattern

**Create custom error classes for business rule violations:**

```typescript
export class DomainError extends Error {}

export class DuplicateNameError extends DomainError {
  constructor(name: string) {
    super(`Name "${name}" already exists`);
    this.name = "DuplicateNameError";
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

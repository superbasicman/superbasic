# Services, Repositories & Dependency Injection

This doc explains how we structure **business logic**, **data access**, and **dependency injection**.

Goals:

- Keep HTTP, business rules, and persistence **separate**.
- Make domain logic **easy to test**.
- Make it obvious **where code belongs**.

---

## 1. Core Rules

**Services**

- Implement business operations per domain (tokens, transactions, budgets, …).
- Orchestrate repositories, apply business rules, emit domain events.
- Return **domain/DTO types**, not raw Prisma models.
- Throw **domain errors** (e.g. `DuplicateTokenNameError`), not HTTP responses.

**Repositories**

- Wrap **Prisma** (or other persistence).
- Do **pure CRUD / queries**.
- Return **Prisma entities**.
- Contain **no business logic or validation**.

**Dependency Injection**

- Wire real dependencies in **`apps/api`**, not in `packages/core`.
- Use **constructor injection** so services are easy to test with fakes/mocks.

**Default style**

- Use **class-based services by default**.
- Use **functional services** only for small, stateless, one-off operations.

---

## 2. Service Pattern (Business Logic)

**Class-based service (default)**

```typescript
// packages/core/src/tokens/token-service.ts

export class TokenService {
  constructor(
    private tokenRepo: TokenRepository,
    private auditLogger: AuditLogger
  ) {}

  /**
   * Business rules:
   * - Token names must be unique per user
   * - Scopes must be valid
   * - Expiration must be between 1–365 days
   */
  async createToken(params: CreateTokenParams): Promise<CreateTokenResult> {
    this.validateTokenParams(params);

    const isDuplicate = await this.tokenRepo.existsByUserAndName(
      params.userId,
      params.name
    );
    if (isDuplicate) {
      throw new DuplicateTokenNameError(params.name);
    }

    const token = generateToken();
    const keyHash = hashToken(token);
    const last4 = token.slice(-4);
    const expiresAt = this.calculateExpiration(params.expiresInDays);

    const apiKey = await this.tokenRepo.create({
      userId: params.userId,
      profileId: params.profileId,
      name: params.name,
      keyHash,
      last4,
      scopes: params.scopes,
      expiresAt,
    });

    await this.auditLogger.logTokenCreated({
      tokenId: apiKey.id,
      userId: params.userId,
      tokenName: params.name,
      scopes: params.scopes,
    });

    return {
      token, // plaintext, shown once
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

**Functional style (optional for simple cases)**

```typescript
// packages/core/src/tokens/token-operations.ts

export async function createToken(
  params: CreateTokenParams,
  deps: { tokenRepo: TokenRepository; auditLogger: AuditLogger }
): Promise<CreateTokenResult> {
  // Same rules and flow as TokenService#createToken
}
```

**HTTP layer maps domain errors → HTTP responses**

```typescript
// apps/api/src/routes/v1/tokens/create.ts

createTokenRoute.post("/", async (c) => {
  const userId = c.get("userId");
  const profileId = c.get("profileId");
  const body = c.req.valid("json");

  try {
    const result = await tokenService.createToken({ userId, profileId, ...body });
    return c.json(result, 201);
  } catch (error) {
    if (error instanceof DuplicateTokenNameError) {
      return c.json({ error: error.message }, 409);
    }
    if (error instanceof InvalidScopesError) {
      return c.json({ error: error.message }, 400);
    }
    throw error; // global error handler
  }
});
```

---

## 3. Domain Errors

Domain errors live in the domain package and represent **business rule violations**.

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
```

---

## 4. Repository Pattern (Data Access)

Repositories are thin Prisma wrappers. They return **Prisma entities**, not DTOs.

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
}
```

**Guidelines**

- No HTTP, no DTO mapping, no domain errors here.
- Services handle mapping and business rules.

---

## 5. Transactions (Multi-Repo Workflows)

If a business operation needs multiple writes that must succeed/fail together, use a transaction.

```typescript
// packages/core/src/shared/database.ts

export class Database {
  constructor(private prisma: PrismaClient) {}

  async tx<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => fn(tx));
  }
}
```

```typescript
// packages/core/src/connections/connection-service.ts

export class ConnectionService {
  constructor(
    private db: Database,
    private connectionRepo: ConnectionRepository,
    private accountRepo: AccountRepository
  ) {}

  async createConnectionWithAccounts(params: CreateConnectionWithAccountsParams) {
    return this.db.tx(async (tx) => {
      const connection = await this.connectionRepo.create(tx, { /* ... */ });
      const accounts = await this.accountRepo.bulkCreate(tx, {
        connectionId: connection.id,
        accounts: params.accounts,
      });

      return { connection, accounts };
    });
  }
}
```

---

## 6. Dependency Injection (apps/api)

Wire **real** dependencies at the app edge, grouped per domain.

```typescript
// apps/api/src/services/tokens.ts

import { prisma } from "@repo/database";
import { TokenRepository, TokenService } from "@repo/core";
import { auditLogger } from "@repo/observability";

export const tokenRepository = new TokenRepository(prisma);
export const tokenService = new TokenService(tokenRepository, auditLogger);
```

```typescript
// apps/api/src/services/index.ts

export * from "./tokens";
// export * from "./connections";
// etc.
```

Route usage:

```typescript
// apps/api/src/routes/v1/connections/create.ts

import { connectionService } from "../../../services/index.js";

createConnectionRoute.post("/", async (c) => {
  const userId = c.get("userId");
  const profileId = c.get("profileId");
  const body = c.req.valid("json");

  const result = await connectionService.createConnection({
    userId,
    profileId,
    ...body,
  });

  return c.json(result, 201);
});
```

---

## 7. Anti-Patterns (Red Flags in PRs)

- ❌ Inject `PrismaClient` directly into services.  
  ✅ Always go through repositories.

- ❌ Call repositories from route handlers.  
  ✅ Routes → services → repositories.

- ❌ Put business logic or validation in repositories.  
  ✅ Business rules live in services/domain helpers.

- ❌ Return HTTP responses or use `c.json(...)` in services or repositories.  
  ✅ Only the HTTP layer knows about HTTP.

- ❌ Map Prisma entities to DTOs in repositories.  
  ✅ Repos return persistence entities; services map to domain/response types.

---

## 8. TL;DR

- **Services:** business workflows, domain rules, orchestration, domain errors, DTOs.
- **Repositories:** Prisma CRUD only, return Prisma models.
- **DI:** wired in `apps/api`, per-domain, via constructor injection.
- **Routes:** thin controllers that translate HTTP ↔ domain and call services only.

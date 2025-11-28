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
export class ExampleService {
  constructor(
    private exampleRepo: ExampleRepository,
    private auditLogger: AuditLogger
  ) {}

  async doWork(params: DoWorkParams): Promise<DoWorkResult> {
    // validate params
    // orchestrate repos
    // emit domain events
    const record = await this.exampleRepo.create(params);
    await this.auditLogger.logExampleCreated({ id: record.id });
    return mapToDto(record);
  }
}
```

**Functional style (optional for simple cases)**

```typescript
export async function doWork(
  params: DoWorkParams,
  deps: { exampleRepo: ExampleRepository; auditLogger: AuditLogger }
): Promise<DoWorkResult> {
  // Same rules and flow as the class method
}
```

**HTTP layer maps domain errors → HTTP responses**

```typescript
createRoute.post("/", async (c) => {
  const body = c.req.valid("json");

  try {
    const result = await exampleService.doWork(body);
    return c.json(result, 201);
  } catch (error) {
    if (error instanceof DomainConflictError) {
      return c.json({ error: error.message }, 409);
    }
    throw error;
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

PAT routes now use auth-core directly; avoid wiring legacy `TokenService`/`TokenRepository` in `apps/api`. Keep DI wiring focused on active domains (e.g., connections, budgets, etc.) and instantiate services at the app edge as needed.

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

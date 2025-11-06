# Domain Errors & Package Structure

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

**Guidelines:**

- Keep domain errors close to the domain (e.g. `tokens/token-errors.ts`).
- Surface domain errors from services; catch them in route handlers and translate to HTTP responses.
- Prefer specific error classes over stringly-typed errors.

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

**Guidelines:**

- One folder per domain (`tokens`, `connections`, `transactions`, `budgets`, etc.).
- Each domain gets:
  - `*-service.ts` (business logic)
  - `*-repository.ts` (data access)
  - `*-errors.ts` (domain errors)
  - `*-types.ts` (domain types/interfaces)
  - `index.ts` (public exports)
- Tests live beside the code under `__tests__/` per domain.

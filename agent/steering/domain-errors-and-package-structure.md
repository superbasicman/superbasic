# Domain Errors & Package Structure

## Domain Errors Pattern

Domain errors represent **business rule violations** (not HTTP, not DB errors). They are:

- Defined in the **domain package** (e.g. `packages/core/src/tokens/token-errors.ts`).
- Thrown from **services**.
- Caught at the **route/HTTP layer** and translated into HTTP responses.

```typescript
// packages/core/src/tokens/token-errors.ts

export class TokenError extends Error {
  constructor(
    message: string,
    /** Stable machine-readable code, used for mapping/logging */
    public readonly code: string
  ) {
    super(message);
    this.name = "TokenError";
  }
}

export class DuplicateTokenNameError extends TokenError {
  constructor(name: string) {
    super(`Token name "${name}" already exists`, "TOKEN_DUPLICATE_NAME");
    this.name = "DuplicateTokenNameError";
  }
}

export class InvalidScopesError extends TokenError {
  constructor(scopes: string[]) {
    super(`Invalid scopes: ${scopes.join(", ")}`, "TOKEN_INVALID_SCOPES");
    this.name = "InvalidScopesError";
  }
}

export class TokenNotFoundError extends TokenError {
  constructor(id: string) {
    super(`Token not found: ${id}`, "TOKEN_NOT_FOUND");
    this.name = "TokenNotFoundError";
  }
}
```

**Guidelines**

- Keep domain errors **close to their domain** (e.g. `tokens/token-errors.ts`, `transactions/transaction-errors.ts`).
- Services throw domain errors; route handlers catch them and map to HTTP codes (e.g. 400, 404, 409).
- Prefer **specific error classes** over stringly-typed errors.
- Error messages should be **safe to log and, if needed, show to users**—don’t include secrets or raw tokens.
- Domain errors must **not** contain HTTP status codes or HTTP-specific concerns; mapping happens in `apps/api`.

Optional pattern for cross-cutting errors:

- Keep truly generic errors (e.g. `DomainError`, `OptimisticLockError`) in a shared module like `packages/core/src/shared/errors.ts`.

---

## Package Structure for Domain Logic

```text
packages/core/src/
├─ tokens/
│  ├─ token-service.ts             # Business logic
│  ├─ token-repository.ts          # Data access
│  ├─ token-errors.ts              # Domain errors
│  ├─ token-types.ts               # Domain types / DTOs
│  ├─ index.ts                     # Public API for the tokens domain
│  └─ __tests__/
│     ├─ token-service.test.ts     # Unit tests (no DB)
│     └─ token-repository.test.ts  # Integration tests (with DB)
├─ connections/
│  ├─ connection-service.ts
│  ├─ connection-repository.ts
│  ├─ connection-errors.ts?        # As needed
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

**Guidelines**

- **One folder per domain** (`tokens`, `connections`, `transactions`, `budgets`, …).
- Each domain typically gets:
  - `*-service.ts` — business logic (services).
  - `*-repository.ts` — data access (Prisma, etc.).
  - `*-errors.ts` — domain errors (if the domain has non-trivial rules).
  - `*-types.ts` — domain types / DTOs (input/output shapes, domain models).
  - `index.ts` — public exports used by other packages (`apps/api`, etc.).
- Tests live per domain under `__tests__/`:
  - Service tests are **unit tests** (mock/fake repos).
  - Repository tests are **integration tests** (real DB).
- External code should import from the **domain’s `index.ts`**, not from deep paths inside the folder.

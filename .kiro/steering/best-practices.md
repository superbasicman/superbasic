# Slim-Down Best Practices

Guidelines to keep work focused, production-ready, and simple while we reshape the repo.

## Planning & Coordination

- Write down scope and acceptance criteria before coding; keep README plans updated.
- Work in feature-aligned branches and open smaller PRs instead of giant dumps.
- Flag risky changes early (auth, billing, migrations) so we can plan rollbacks.

## Code Organization

### Current State vs Target State

**Current Implementation (Phase 1-3):**

- Route handlers in `apps/api/src/routes/v1/` contain inline business logic and Prisma calls
- `packages/core` exports only billing/ledger placeholders

**Target State (Phase 4+):**

- Domain logic moves to `packages/core` as services and repositories
- Route handlers become thin controllers
- Apply this pattern to new features only

### Organization Principles

- Keep domain logic in `packages/core` and surface it via pure functions; apps consume only those APIs. _(Target state for new features)_
- Restrict `apps/web` to SDK/API calls—lint or CI should fail on direct DB imports. _(Already enforced)_
- Favor composable Hono middlewares for CORS, rate limits, and auth; avoid bespoke wrappers unless necessary. _(Already implemented)_
- Centralize secret parsing in server-only modules (`apps/api`, `packages/auth`, etc.); never surface secrets in `apps/web` or anything shipped to the browser. _(Already enforced)_

## Separation of Concerns & Clean Architecture

> **⚠️ ASPIRATIONAL GUIDANCE**: The layered architecture described below is the target state for new features and major refactors. The current codebase (Phase 3 and earlier) implements business logic directly in route handlers with inline Prisma calls. This is acceptable for existing code. Apply this pattern only to:
>
> - **New features** (Phase 4+)
> - **Major refactors** where you're already touching significant code
> - **Greenfield work** where starting clean makes sense
>
> **Do NOT attempt to refactor existing working code** (tokens, auth, etc.) to match this pattern unless explicitly requested.

### Layered Architecture Pattern (Target State)

Follow a strict three-layer architecture for new API features:

```
┌─────────────────────────────────────────────────────────┐
│ apps/api/src/routes/v1/                                 │
│ HTTP LAYER (Controllers)                                 │
│ - Parse/validate HTTP requests                           │
│ - Call service layer methods                             │
│ - Format HTTP responses                                  │
│ - Handle HTTP-specific errors (4xx, 5xx)                │
│ - Apply middleware (auth, rate limits, validation)      │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ packages/core/src/{domain}/                             │
│ BUSINESS LOGIC LAYER (Services)                          │
│ - Implement business rules and workflows                 │
│ - Orchestrate multiple repository calls                  │
│ - Validate business constraints                          │
│ - Emit domain events for audit logging                   │
│ - Return domain objects (not HTTP responses)             │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ packages/core/src/{domain}/                             │
│ DATA ACCESS LAYER (Repositories)                         │
│ - Pure Prisma operations (CRUD only)                     │
│ - No business logic or validation                        │
│ - Return database entities                               │
│ - Handle database-specific errors                        │
└─────────────────────────────────────────────────────────┘
```

### Single Responsibility Principle (SRP)

**Each function should have ONE clear responsibility:**

- **Route handlers**: Parse request → Call service → Format response
- **Services**: Implement ONE business operation (createToken, syncTransactions, calculateBudget)
- **Repositories**: Perform ONE database operation (findById, create, update, delete)
- **Utilities**: Perform ONE pure function (hashToken, formatCurrency, validateEmail)

**Keep functions focused and short:**

- Aim for functions under 50 lines (ideally 20-30)
- If a function does multiple things, extract helper functions
- Use early returns to reduce nesting
- Extract complex conditionals into named boolean functions

### Route Handler Pattern (HTTP Layer)

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

### Service Layer Pattern (Business Logic)

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
   * - Expiration must be between 1-365 days
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

### Repository Pattern (Data Access)

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

### Domain Errors Pattern

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

### Package Structure for Domain Logic

```
packages/core/src/
├─ tokens/
│  ├─ token-service.ts          # Business logic
│  ├─ token-repository.ts       # Data access
│  ├─ token-errors.ts           # Domain errors
│  ├─ token-types.ts            # Domain types
│  ├─ index.ts                  # Public exports
│  └─ __tests__/
│     ├─ token-service.test.ts  # Unit tests (no DB)
│     └─ token-repository.test.ts # Integration tests (with DB)
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

### Dependency Injection Pattern (Target State)

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
  const result = await connectionService.createConnection({ ... });
  return c.json(result, 201);
});
```

**Current State (Phase 3 and earlier):**
Existing routes (tokens, auth, etc.) implement logic inline with direct Prisma calls. This is acceptable and does not need refactoring unless you're making major changes to those areas.

### Testing Strategy by Layer

**Unit Tests (packages/core):**

- Test services with mocked repositories
- Test repositories with test database
- Test utilities as pure functions
- No HTTP mocking needed

**Integration Tests (apps/api):**

- Test route handlers with real services
- Test full request/response cycle
- Test middleware integration
- Use test database

**E2E Tests (apps/web):**

- Test user flows through UI
- Test against running API
- Test OAuth/auth flows

### Migration Strategy for Existing Code

**Don't refactor everything at once. Use this approach:**

1. **New features** (Phase 4+): Implement with proper layering from day one
2. **Bug fixes**: Keep changes minimal - do NOT refactor while fixing bugs
3. **Major changes**: Only refactor if you're already rewriting significant portions
4. **Technical debt**: Requires explicit user request - never refactor proactively

**Current State:**

- Phase 1-3 code (auth, tokens, profiles) uses inline Prisma calls in route handlers
- This is working, tested, and production-ready
- Leave it alone unless explicitly asked to refactor

**Example migration path (only if requested):**

1. Create `packages/core/src/tokens/` structure
2. Extract repository methods from route handlers
3. Extract service methods that use repositories
4. Update route handlers to use services
5. Add unit tests for services
6. Verify integration tests still pass

**When implementing Phase 4+ features:**
Start with the layered pattern from the beginning rather than refactoring later.

### When to Deviate from This Pattern

**It's okay to skip layers for:**

- Simple CRUD with no business logic (health checks, basic lookups)
- Utility endpoints (CSRF token, session check)
- Webhook handlers that just enqueue jobs
- **All existing Phase 1-3 code** (already implemented with inline logic)

**For new features (Phase 4+), ask: "Will this need business logic later?"**

- If yes, use the full pattern from the start
- If no, keep it simple but document the decision

**Current Reality Check:**
If you find yourself wanting to refactor existing working code to match this pattern, STOP and ask the user first. The pattern is for new work, not retrofitting.

## Database Reference Patterns

- **Authentication tables** (api_keys, sessions): Reference `users.id` from Auth.js
- **Business logic tables** (connections, workspaces, budgets): Reference `profiles.id`
- **Middleware**: Auth middleware attaches both `userId` (for authentication) and `profileId` (for business logic) to request context
- **Why the split**: Auth.js manages identity; profiles store user preferences and own business data
- **Migration path**: Existing code uses `userId` from JWT; new code should use `profileId` for domain operations

## Code Quality

- Write DRY, modular code—extract repeated logic into small, focused functions.
- Keep functions ideally under 50 lines roughly; break down complex logic into composable pieces.
- Prefer readable code over clever code; clear naming beats comments but still add comments.
- Extract magic numbers and strings into named constants.
- Avoid deeply nested conditionals; use early returns and guard clauses.
- Use async/await for asynchronous code; avoid callback hell and deeply nested promises.

## Security & Compliance

- Hash all personal access tokens and store only the digest; surface plaintext once on creation.
- Enforce `Authorization: Bearer` for every `/v1` route; intentionally whitelist any public route.
- Implement Postgres row-level security for multi-tenant tables using session variables and Prisma transactions.
- Log sensitive actions (key create/revoke, billing updates, Plaid sync failures) to the audit trail with request IDs.

### Secrets Management in Documentation & Scripts

- **NEVER hardcode actual API keys, tokens, or secrets** in `.md` files, scripts, or code examples
- **Always use placeholders** in documentation: `re_your_api_key_here`, `sk_test_xxxxx`, `your_secret_here`
- **Scripts must require environment variables** - no fallback to hardcoded values for sensitive data
- **Test scripts should fail fast** with clear error messages if required env vars are missing
- **Example files** (`.env.example`) should only contain placeholder values, never real secrets
- **Documentation examples** should show how to pass env vars, not actual values:

  ```bash
  # ✅ Good - shows pattern
  RESEND_API_KEY=re_your_key pnpm tsx script.ts

  # ❌ Bad - exposes actual key
  RESEND_API_KEY=re_QCFJoGYk_xxx pnpm tsx script.ts
  ```

- **If a secret is accidentally committed**, rotate it immediately and update all references to use placeholders

## API Contracts

- Use Zod schemas for every handler input/output; derive types and OpenAPI spec from them.
- Snapshot OpenAPI output in CI and review diffs on PRs.
- Version routes under `/v1`; only non-breaking additions allowed within the version.

## Database & Migrations

- Model finance data as append-only ledger entries; never delete or mutate historical rows.
- Keep Prisma migrations in version control and run them locally before pushing.
- Backfill data with migration scripts or explicit tasks; avoid manual edits.
- Set `pg_set_config` variables for user/workspace IDs at the start of each request to satisfy RLS.

## Background Workflows

- Use Upstash QStash for long-running Plaid syncs; chunk work so each handler finishes under the Vercel timeout.
- Persist sync cursors and statuses in `sync_sessions`; re-queue jobs defensively on failure.
- Batch manual "Sync Now" requests and rely on frontend polling; never block a request on the whole sync.

## Testing & Verification

- Default check: `pnpm run lint`, `pnpm run test`, `pnpm run build` before commit.
- Add unit tests alongside new core logic and integration tests for new `/v1` routes.
- Run end-to-end smoke tests (login, key creation, checkout, Plaid link) before releases.
- Verify OpenAPI diff is clean and SDK build completes in CI.

## Observability & Monitoring

- Attach a `requestId` to every API request; include it in logs and audit entries.
- Standardize error responses with codes and messages; avoid leaking internal stack traces.
- Ensure Sentry captures edge and node environments; Pino logs should include structured metadata.

## Operational Hygiene

- Document deploy steps in `tooling/ci` and keep them reproducible.
- Store runbooks for Stripe/Plaid webhook rotation, key revocation, and incident response.
- Keep `.env.example` updated with only the vars needed by each app.
- When removing packages/apps, archive them first so we can resurrect if needed.

## Git Workflow

- **NEVER run git commands** (`git add`, `git commit`, `git push`, etc.) when making code changes
- **User handles version control** - focus only on making the requested code changes
- **Exception**: Reading git state is fine (`git status`, `git log`, `git diff`) if needed for context
- **Rationale**: User maintains control over commit messages, staging, and push timing

## Culture & Collaboration

- Keep comments concise; prefer clear naming over verbose explanations.
- Raise questions when requirements conflict with security/production readiness; don't assume intent.
- Celebrate simplifications—deleting unused code is a win.

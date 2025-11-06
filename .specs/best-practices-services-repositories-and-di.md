# Services, Repositories & Dependency Injection

## Service Layer Pattern (Business Logic)

**Services implement business operations as classes or pure functions:**

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
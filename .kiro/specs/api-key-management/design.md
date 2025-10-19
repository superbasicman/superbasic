# Design Document

## Overview

The API Key Management system enables users to generate Personal Access Tokens (PATs) for programmatic API access. This design builds on the session authentication foundation from Phase 2, adding a parallel authentication path for Bearer tokens. The system implements industry-standard security practices including cryptographically secure token generation, SHA-256 hashing, scope-based permissions, and comprehensive audit logging.

**Key Design Principles**:

- **Separation of Concerns**: PAT authentication is separate from session authentication (different middleware, different token formats)
- **Security First**: Plaintext tokens shown once, SHA-256 hashing, constant-time comparison, rate limiting
- **Least Privilege**: Scope-based permissions restrict token capabilities
- **Auditability**: All token operations logged with full context
- **Developer Experience**: Clear token format (`sbf_` prefix), helpful error messages, usage analytics

## Design Decisions

### 1. Soft Delete vs Hard Delete

**Decision**: Use soft delete (revokedAt timestamp) for all token revocations.

**Rationale**:

- Preserves audit trail indefinitely
- Enables investigation of security incidents
- Aligns with append-only financial data philosophy
- Hard deletion only for GDPR/compliance via explicit scripts

### 2. User/Profile Reference Pattern

**Decision**: Tokens reference both userId (auth) and profileId (business logic).

**Rationale**:

- Consistent with Phase 2 authentication architecture
- userId for Auth.js identity and authentication
- profileId for business data ownership and domain logic
- Enables clean separation of concerns

### 3. Workspace Token Support

**Decision**: Schema supports workspaceId, but Phase 3 only implements personal tokens (profileId).

**Rationale**:

- Workspace collaboration is Phase 6
- Database constraint ensures either profileId OR workspaceId (not both)
- Avoids premature complexity
- Easy to extend when workspaces are implemented

### 4. Scope Namespace

**Decision**: Use flat, unversioned scope strings (e.g., `read:transactions`).

**Rationale**:

- Simple to implement and understand
- Sufficient for Phase 3-5 (no breaking changes expected)
- Can add versioning in Phase 11 if needed (e.g., `v2:read:transactions`)
- Aligns with OAuth 2.0 scope conventions

### 5. Token Masking Strategy

**Decision**: Persist last 4 characters of plaintext token at creation, display as `sbf_****abcd`.

**Rationale**:

- Provides visual differentiation between tokens
- Matches what user actually saw during creation (better UX than hash tail)
- Doesn't reveal entropy or enable reconstruction
- Familiar UX pattern (credit cards, API keys)
- Implementation: Extract `token.slice(-4)` before hashing, store in `last4` column

### 6. Expiration Policy

**Decision**: Default 90-day expiration, configurable 1-365 days.

**Rationale**:

- Balances security (limited lifetime) with usability (not too short)
- Aligns with industry standards (GitHub: 90 days, AWS: 90 days)
- Can be tightened in Phase 13 based on subscription tier
- Optional expiration (null) for internal/admin tokens

### 7. Rate Limiting Strategy

**Decision**: 10 tokens/hour per user, 100 failed auth/hour per IP.

**Rationale**:

- Prevents token creation abuse (10/hour = 240/day max)
- Prevents brute force attacks (100 failures = ~1.6/min)
- Uses existing Upstash Redis infrastructure from Phase 2
- Can be adjusted based on real-world usage patterns

### 8. Audit Event Destination

**Decision**: Emit events via authEvents, logged by Pino to stdout.

**Rationale**:

- Reuses Phase 2 audit infrastructure
- No additional wiring needed
- Vercel captures stdout automatically
- Phase 12 will add Sentry and log aggregation

## Architecture

### High-Level Flow

```
User → Web Client → API Server → Token Middleware → Protected Routes
                         ↓
                  Token Generation
                         ↓
                  SHA-256 Hash Storage
                         ↓
                  Bearer Token Auth
```

### Authentication Paths

```
┌─────────────────────────────────────────────────────────────┐
│                     API Server (Hono)                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Session Auth Path (Phase 2)    │    PAT Auth Path (Phase 3)│
│  ─────────────────────────────   │    ──────────────────────│
│                                   │                           │
│  Cookie: __Host-sbfin_auth       │    Authorization: Bearer  │
│         ↓                         │           ↓               │
│  authMiddleware                   │    patMiddleware          │
│         ↓                         │           ↓               │
│  JWT decode & verify              │    SHA-256 hash & lookup  │
│         ↓                         │           ↓               │
│  c.set("userId", ...)             │    c.set("userId", ...)   │
│  c.set("authType", "session")     │    c.set("authType", "pat")│
│         ↓                         │    c.set("tokenScopes", ...)│
│  Protected Routes                 │           ↓               │
│                                   │    Scope Check            │
│                                   │           ↓               │
│                                   │    Protected Routes       │
└─────────────────────────────────────────────────────────────┘
```

### Components

1. **Token Generation Service** (`packages/auth/src/pat.ts`)

   - Cryptographically secure random token generation
   - SHA-256 hashing utilities
   - Token format validation
   - Constant-time comparison

2. **API Token Routes** (`apps/api/src/routes/v1/tokens`)

   - POST /v1/tokens - Create new token
   - GET /v1/tokens - List user's tokens
   - DELETE /v1/tokens/:id - Revoke token
   - PATCH /v1/tokens/:id - Update token name (optional)

3. **PAT Authentication Middleware** (`apps/api/src/middleware/pat.ts`)

   - Extract Bearer token from Authorization header
   - Hash and verify against database
   - Check expiration
   - Attach user context and scopes
   - Update last_used_at timestamp

4. **Scope Enforcement Middleware** (`apps/api/src/middleware/scopes.ts`)

   - Verify token has required scopes
   - Skip check for session auth (full access)
   - Return 403 for insufficient permissions

5. **Web Client Token Management** (`apps/web/src/pages/Settings/ApiKeys.tsx`)
   - Token list view
   - Token creation modal
   - Token revocation confirmation
   - Usage analytics display

## Components and Interfaces

### 1. Database Schema

Add `ApiKey` model to `packages/database/schema.prisma`:

```prisma
model ApiKey {
  id          String    @id @default(uuid())
  userId      String    // Auth.js user reference (for authentication)
  profileId   String?   // Business logic owner (personal tokens)
  workspaceId String?   // Workspace-scoped tokens (future use)
  name        String    // User-provided description (e.g., "CI/CD Pipeline", "Mobile App")
  keyHash     String    @unique // SHA-256 hash of the plaintext token
  last4       String    // Last 4 chars of plaintext token (for display)
  scopes      Json      @default("[]") // Array of permission strings
  lastUsedAt  DateTime? // Updated on each successful authentication
  expiresAt   DateTime? // Token expiration timestamp
  revokedAt   DateTime? // Soft delete timestamp
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  profile Profile? @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([profileId])
  @@index([workspaceId])
  @@index([keyHash]) // Fast lookup during authentication
  @@index([revokedAt]) // Partial index for active tokens
  @@unique([userId, name]) // Prevent duplicate names per user
  @@map("api_keys")
}
```

**Database Constraints**:

```sql
-- XOR constraint: exactly one of profileId or workspaceId must be set
ALTER TABLE api_keys
ADD CONSTRAINT api_keys_owner_xor
CHECK ((profile_id IS NOT NULL)::int + (workspace_id IS NOT NULL)::int = 1);
```

Update `User` and `Profile` models to include relations:

```prisma
model User {
  // ... existing fields
  apiKeys ApiKey[]
}

model Profile {
  // ... existing fields
  apiKeys ApiKey[]
}
```

**Migration Notes**:

- Uses `uuid()` for ID generation (consistent with project standard)
- `keyHash` (not `tokenHash`) matches database-schema.md naming
- `Json` type for scopes (not `String[]`) matches Prisma conventions
- `profileId` and `workspaceId` support user/profile separation pattern
- Database constraint: `CHECK (profileId IS NOT NULL OR workspaceId IS NOT NULL)` enforced at DB level
- `revokedAt` enables soft deletes for audit trail
- `onDelete: Cascade` ensures tokens are deleted when user/profile is deleted

### 2. Token Generation Service

Located in `packages/auth/src/pat.ts`:

```typescript
import crypto from "node:crypto";

/**
 * Token format: sbf_<base64url>
 * - sbf_ prefix enables secret scanning in code repositories
 * - 32 bytes of entropy = 256 bits (cryptographically secure)
 * - base64url encoding (URL-safe, no padding)
 */
export function generateToken(): string {
  const bytes = crypto.randomBytes(32);
  const base64url = bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `sbf_${base64url}`;
}

/**
 * Hash token using SHA-256
 * Stored in database for verification
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Verify token against stored hash using constant-time comparison
 * Prevents timing attacks
 */
export function verifyToken(token: string, hash: string): boolean {
  const tokenHash = hashToken(token);
  return crypto.timingSafeEqual(Buffer.from(tokenHash), Buffer.from(hash));
}

/**
 * Validate token format
 * Returns true if token matches sbf_<base64url> pattern
 */
export function isValidTokenFormat(token: string): boolean {
  return /^sbf_[A-Za-z0-9_-]{43}$/.test(token);
}
```

**Security Notes**:

- `crypto.randomBytes(32)` provides 256 bits of entropy (NIST recommendation)
- SHA-256 is one-way (cannot reverse hash to plaintext)
- `crypto.timingSafeEqual` prevents timing attacks during verification
- Token prefix `sbf_` enables GitHub secret scanning and other security tools

### 3. Scope Definitions

Located in `packages/auth/src/rbac.ts`:

```typescript
/**
 * Valid API scopes for token permissions
 * Format: <action>:<resource>
 */
export const VALID_SCOPES = [
  // Transaction scopes
  "read:transactions",
  "write:transactions",

  // Budget scopes
  "read:budgets",
  "write:budgets",

  // Account scopes
  "read:accounts",
  "write:accounts",

  // Profile scopes
  "read:profile",
  "write:profile",

  // Workspace scopes (future)
  "read:workspaces",
  "write:workspaces",

  // Admin scope (full access)
  "admin",
] as const;

export type Scope = (typeof VALID_SCOPES)[number];

/**
 * Check if a set of scopes includes a required scope
 * "admin" scope grants all permissions
 */
export function hasScope(userScopes: string[], requiredScope: Scope): boolean {
  return userScopes.includes("admin") || userScopes.includes(requiredScope);
}

/**
 * Validate that all provided scopes are valid
 */
export function validateScopes(scopes: string[]): boolean {
  return scopes.every((scope) => VALID_SCOPES.includes(scope as Scope));
}

/**
 * Endpoint to scope mapping
 * Used by scope enforcement middleware
 */
export const ENDPOINT_SCOPES: Record<
  string,
  { method: string; scope: Scope }[]
> = {
  "/v1/transactions": [
    { method: "GET", scope: "read:transactions" },
    { method: "POST", scope: "write:transactions" },
  ],
  "/v1/transactions/:id": [
    { method: "GET", scope: "read:transactions" },
    { method: "PATCH", scope: "write:transactions" },
    { method: "DELETE", scope: "write:transactions" },
  ],
  "/v1/budgets": [
    { method: "GET", scope: "read:budgets" },
    { method: "POST", scope: "write:budgets" },
  ],
  "/v1/budgets/:id": [
    { method: "GET", scope: "read:budgets" },
    { method: "PATCH", scope: "write:budgets" },
    { method: "DELETE", scope: "write:budgets" },
  ],
  "/v1/me": [
    { method: "GET", scope: "read:profile" },
    { method: "PATCH", scope: "write:profile" },
  ],
};
```

**Scope Design**:

- Granular permissions (read vs write, per resource)
- `admin` scope grants full access (for internal tools)
- Endpoint mapping enables automatic scope enforcement
- Session auth bypasses scope checks (full access)

### 4. API Route Schemas

Located in `packages/types/src/token.schema.ts`:

```typescript
import { z } from "zod";
import { VALID_SCOPES } from "@repo/auth";

export const CreateTokenSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(VALID_SCOPES)).min(1),
  expiresInDays: z.number().int().min(1).max(365).optional().default(90),
});

export const UpdateTokenSchema = z.object({
  name: z.string().min(1).max(100),
});

export const TokenResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  scopes: z.array(z.string()),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string(),
  maskedToken: z.string(), // Only last 4 chars visible
});

export const CreateTokenResponseSchema = TokenResponseSchema.extend({
  token: z.string(), // Plaintext token (shown once)
});

export type CreateTokenInput = z.infer<typeof CreateTokenSchema>;
export type UpdateTokenInput = z.infer<typeof UpdateTokenSchema>;
export type TokenResponse = z.infer<typeof TokenResponseSchema>;
export type CreateTokenResponse = z.infer<typeof CreateTokenResponseSchema>;
```

### 5. API Routes Implementation

**Create Token Route** (`apps/api/src/routes/v1/tokens/create.ts`):

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CreateTokenSchema } from "@repo/types";
import { generateToken, hashToken, validateScopes } from "@repo/auth";
import { prisma } from "@repo/database";
import { authMiddleware } from "../../../middleware/auth";
import { authEvents } from "@repo/auth";

const createTokenRoute = new Hono();

createTokenRoute.post(
  "/",
  authMiddleware, // Requires session auth
  zValidator("json", CreateTokenSchema),
  async (c) => {
    const userId = c.get("userId");
    const profileId = c.get("profileId"); // Business logic reference
    const { name, scopes, expiresInDays } = c.req.valid("json");

    // Validate scopes
    if (!validateScopes(scopes)) {
      return c.json({ error: "Invalid scopes provided" }, 400);
    }

    // Check for duplicate name
    const existing = await prisma.apiKey.findUnique({
      where: { userId_name: { userId, name } },
    });

    if (existing) {
      return c.json({ error: "Token name already exists" }, 409);
    }

    // Generate token and hash
    const token = generateToken();
    const keyHash = hashToken(token);
    const last4 = token.slice(-4); // Extract last 4 chars before hashing

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // Create token record (personal token via profileId)
    const apiKey = await prisma.apiKey.create({
      data: {
        userId,
        profileId, // Personal token ownership
        name,
        keyHash,
        last4, // Store for display
        scopes,
        expiresAt,
      },
    });

    // Emit audit event
    authEvents.emit({
      type: "token.created",
      userId,
      metadata: {
        tokenId: apiKey.id,
        profileId,
        tokenName: name,
        scopes,
        expiresAt: expiresAt.toISOString(),
        ip:
          c.req.header("x-forwarded-for") ||
          c.req.header("x-real-ip") ||
          "unknown",
        userAgent: c.req.header("user-agent") || "unknown",
        timestamp: new Date().toISOString(),
      },
    });

    // Return plaintext token (only time it's shown)
    return c.json(
      {
        token, // Plaintext - user must save this
        id: apiKey.id,
        name: apiKey.name,
        scopes: apiKey.scopes,
        createdAt: apiKey.createdAt.toISOString(),
        lastUsedAt: null,
        expiresAt: apiKey.expiresAt?.toISOString() ?? null,
        maskedToken: `sbf_****${apiKey.last4}`, // Use stored last4
      },
      201
    );
  }
);

export { createTokenRoute };
```

**List Tokens Route** (`apps/api/src/routes/v1/tokens/list.ts`):

```typescript
import { Hono } from "hono";
import { prisma } from "@repo/database";
import { authMiddleware } from "../../../middleware/auth";

const listTokensRoute = new Hono();

listTokensRoute.get("/", authMiddleware, async (c) => {
  const userId = c.get("userId");

  const tokens = await prisma.apiKey.findMany({
    where: {
      userId,
      revokedAt: null, // Only show active tokens
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      scopes: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      last4: true, // For masking
    },
  });

  // Mask tokens (show last 4 chars from stored value)
  const maskedTokens = tokens.map((token) => ({
    id: token.id,
    name: token.name,
    scopes: token.scopes,
    createdAt: token.createdAt.toISOString(),
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    expiresAt: token.expiresAt?.toISOString() ?? null,
    maskedToken: `sbf_****${token.last4}`,
  }));

  return c.json({ tokens: maskedTokens });
});

export { listTokensRoute };
```

**Revoke Token Route** (`apps/api/src/routes/v1/tokens/revoke.ts`):

```typescript
import { Hono } from "hono";
import { prisma } from "@repo/database";
import { authMiddleware } from "../../../middleware/auth";
import { authEvents } from "@repo/auth";

const revokeTokenRoute = new Hono();

revokeTokenRoute.delete("/:id", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const tokenId = c.req.param("id");

  // Find token and verify ownership
  const token = await prisma.apiKey.findUnique({
    where: { id: tokenId },
  });

  if (!token) {
    return c.json({ error: "Token not found" }, 404);
  }

  if (token.userId !== userId) {
    return c.json({ error: "Token not found" }, 404); // Don't leak existence
  }

  // Idempotent: if already revoked, still return 204
  if (!token.revokedAt) {
    // Soft delete token (set revokedAt timestamp)
    await prisma.apiKey.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });

    // Emit audit event (only on first revocation)
    authEvents.emit({
      type: "token.revoked",
      userId,
      metadata: {
        tokenId,
        profileId: token.profileId,
        tokenName: token.name,
        ip:
          c.req.header("x-forwarded-for") ||
          c.req.header("x-real-ip") ||
          "unknown",
        userAgent: c.req.header("user-agent") || "unknown",
        timestamp: new Date().toISOString(),
      },
    });
  }

  return c.body(null, 204);
});

export { revokeTokenRoute };
```

**Revocation Semantics**:

- `DELETE /v1/tokens/:id` returns 204 (idempotent - calling twice is safe)
- Using a revoked token returns 401 with `{ "error": "Token revoked" }`
- Attempting to update/view a revoked token returns 410 Gone (management API)

**Update Token Route** (`apps/api/src/routes/v1/tokens/update.ts`):

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { UpdateTokenSchema } from "@repo/types";
import { prisma } from "@repo/database";
import { authMiddleware } from "../../../middleware/auth";

const updateTokenRoute = new Hono();

updateTokenRoute.patch(
  "/:id",
  authMiddleware,
  zValidator("json", UpdateTokenSchema),
  async (c) => {
    const userId = c.get("userId");
    const tokenId = c.req.param("id");
    const { name } = c.req.valid("json");

    // Find token and verify ownership
    const token = await prisma.apiKey.findUnique({
      where: { id: tokenId },
    });

    if (!token || token.userId !== userId || token.revokedAt) {
      return c.json({ error: "Token not found" }, 404);
    }

    // Check for duplicate name
    const existing = await prisma.apiKey.findUnique({
      where: { userId_name: { userId, name } },
    });

    if (existing && existing.id !== tokenId) {
      return c.json({ error: "Token name already exists" }, 409);
    }

    // Update token
    const updated = await prisma.apiKey.update({
      where: { id: tokenId },
      data: { name },
    });

    return c.json({
      id: updated.id,
      name: updated.name,
      scopes: updated.scopes,
      createdAt: updated.createdAt.toISOString(),
      lastUsedAt: updated.lastUsedAt?.toISOString() ?? null,
      expiresAt: updated.expiresAt?.toISOString() ?? null,
      maskedToken: `sbf_****${updated.last4}`,
    });
  }
);

export { updateTokenRoute };
```

### 6. PAT Authentication Middleware

Located in `apps/api/src/middleware/pat.ts`:

```typescript
import type { Context, Next } from "hono";
import { hashToken, isValidTokenFormat } from "@repo/auth";
import { prisma } from "@repo/database";

/**
 * PAT authentication middleware
 * Extracts Bearer token from Authorization header, verifies against database
 * Attaches user context, profile context, and token scopes to request
 */
export async function patMiddleware(c: Context, next: Next) {
  try {
    // Extract Bearer token from Authorization header
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Validate token format before database lookup
    if (!isValidTokenFormat(token)) {
      // Emit audit event for invalid format (Requirement 13.4)
      authEvents.emit({
        type: "token.auth_failed",
        reason: "invalid_format",
        tokenPrefix: token.substring(0, 8), // Only log prefix for security
        ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
        userAgent: c.req.header("user-agent") || "unknown",
        timestamp: new Date().toISOString(),
      });
      return c.json({ error: "Invalid token format" }, 401);
    }

    // Hash token and lookup in database
    const keyHash = hashToken(token);

    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        user: true,
        profile: true,
      },
    });

    if (!apiKey) {
      // Emit audit event for token not found (Requirement 13.4)
      authEvents.emit({
        type: "token.auth_failed",
        reason: "not_found",
        tokenPrefix: token.substring(0, 8),
        ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
        userAgent: c.req.header("user-agent") || "unknown",
        timestamp: new Date().toISOString(),
      });
      return c.json({ error: "Invalid token" }, 401);
    }

    // Check revocation
    if (apiKey.revokedAt) {
      // Emit audit event for revoked token (Requirement 13.4)
      authEvents.emit({
        type: "token.auth_failed",
        reason: "revoked",
        tokenId: apiKey.id,
        userId: apiKey.userId,
        ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
        userAgent: c.req.header("user-agent") || "unknown",
        timestamp: new Date().toISOString(),
      });
      return c.json({ error: "Token revoked" }, 401);
    }

    // Check expiration
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      // Emit audit event for expired token (Requirement 13.4)
      authEvents.emit({
        type: "token.auth_failed",
        reason: "expired",
        tokenId: apiKey.id,
        userId: apiKey.userId,
        expiresAt: apiKey.expiresAt.toISOString(),
        ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
        userAgent: c.req.header("user-agent") || "unknown",
        timestamp: new Date().toISOString(),
      });
      return c.json({ error: "Token expired" }, 401);
    }

    // Update last used timestamp (fire and forget)
    prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      })
      .catch((err) => {
        console.error("Failed to update token lastUsedAt:", err);
      });

    // Attach user context and token metadata
    // Following user/profile reference pattern: userId for auth, profileId for business logic
    c.set("userId", apiKey.userId);
    c.set("profileId", apiKey.profileId);
    c.set("userEmail", apiKey.user.email);
    c.set("authType", "pat");
    c.set("tokenId", apiKey.id);
    c.set("tokenScopes", apiKey.scopes);

    await next();

    // Emit token usage audit event after request completes
    authEvents.emit({
      type: "token.used",
      userId: apiKey.userId,
      metadata: {
        tokenId: apiKey.id,
        endpoint: c.req.path,
        method: c.req.method,
        status: c.res.status,
        ip:
          c.req.header("x-forwarded-for") ||
          c.req.header("x-real-ip") ||
          "unknown",
        userAgent: c.req.header("user-agent") || "unknown",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("PAT middleware error:", error);
    return c.json({ error: "Unauthorized" }, 401);
  }
}
```

**Design Notes**:

- Token format validation before database lookup (prevents injection)
- Checks both revocation and expiration status
- Last used timestamp updated asynchronously (doesn't block request)
- Generic error messages (prevents user enumeration)
- Follows user/profile reference pattern: attaches both userId and profileId to context

### 7. Middleware Standardization

**Unified Middleware Order** (`apps/api/src/middleware/_middleware.ts`):

```typescript
import { Hono } from "hono";
import { rateLimit } from "./rate-limit";
import { unifiedAuthMiddleware } from "./auth-unified";
import { requireScope } from "./scopes";
import type { Scope } from "@repo/auth";

/**
 * Standard middleware chain factory
 * Order: rateLimit → auth → scope → handler → audit
 */
export function createProtectedRoute(scope?: Scope) {
  const app = new Hono();

  // Apply rate limiting first (before auth to prevent abuse)
  app.use("*", rateLimit);

  // Then authentication (session or PAT)
  app.use("*", unifiedAuthMiddleware);

  // Then scope check (if required)
  if (scope) {
    app.use("*", requireScope(scope));
  }

  // Audit logging happens in individual handlers via authEvents

  return app;
}

/**
 * Pre-wired chains for common patterns
 */
export const protectedRoute = createProtectedRoute();
export const readTransactions = createProtectedRoute("read:transactions");
export const writeTransactions = createProtectedRoute("write:transactions");
export const readBudgets = createProtectedRoute("read:budgets");
export const writeBudgets = createProtectedRoute("write:budgets");
```

**Usage Example**:

```typescript
import { writeTransactions } from "../../../middleware/_middleware";

const createTransactionRoute = writeTransactions;

createTransactionRoute.post("/", async (c) => {
  // Handler has guaranteed: auth + write:transactions scope
});
```

### 8. Unified Authentication Middleware

Located in `apps/api/src/middleware/auth-unified.ts`:

```typescript
import type { Context, Next } from "hono";
import { authMiddleware } from "./auth";
import { patMiddleware } from "./pat";

/**
 * Unified authentication middleware
 * Tries session auth first (cookie), then PAT auth (Bearer token)
 * Use this on routes that accept both authentication methods
 */
export async function unifiedAuthMiddleware(c: Context, next: Next) {
  // Check for session cookie first
  const hasCookie =
    c.req.header("Cookie")?.includes("__Host-sbfin_auth") ||
    c.req.header("Cookie")?.includes("__sbfin_auth");

  if (hasCookie) {
    return authMiddleware(c, next);
  }

  // Check for Bearer token
  const hasBearer = c.req.header("Authorization")?.startsWith("Bearer ");

  if (hasBearer) {
    return patMiddleware(c, next);
  }

  return c.json({ error: "Unauthorized" }, 401);
}
```

**Usage**:

- Use `authMiddleware` for web-only routes (e.g., token management)
- Use `patMiddleware` for API-only routes (e.g., webhooks)
- Use `unifiedAuthMiddleware` for routes that accept both (e.g., transactions, budgets)

### 8. Scope Enforcement Middleware

Located in `apps/api/src/middleware/scopes.ts`:

```typescript
import type { Context, Next } from "hono";
import { hasScope, type Scope, authEvents } from "@repo/auth";

/**
 * Scope enforcement middleware factory
 * Verifies token has required scope for the operation
 * Session auth bypasses scope checks (full access)
 */
export function requireScope(requiredScope: Scope) {
  return async (c: Context, next: Next) => {
    const authType = c.get("authType");

    // Session auth has full access (bypass scope check)
    if (authType === "session") {
      return next();
    }

    // PAT auth requires scope check
    if (authType === "pat") {
      const tokenScopes = c.get("tokenScopes") as string[];

      if (!hasScope(tokenScopes, requiredScope)) {
        // Emit audit event for scope denial (Requirement 13.5)
        const tokenId = c.get("tokenId") as string;
        const userId = c.get("userId") as string;
        const ip =
          c.req.header("x-forwarded-for") ||
          c.req.header("x-real-ip") ||
          "unknown";

        authEvents.emit({
          type: "token.scope_denied",
          userId,
          metadata: {
            tokenId,
            endpoint: c.req.path,
            method: c.req.method,
            requiredScope,
            providedScopes: tokenScopes,
            ip,
            userAgent: c.req.header("user-agent") || "unknown",
            timestamp: new Date().toISOString(),
          },
        });

        return c.json(
          {
            error: "Insufficient permissions",
            required: requiredScope,
          },
          403
        );
      }

      return next();
    }

    // No auth type set (shouldn't happen if auth middleware ran)
    return c.json({ error: "Unauthorized" }, 401);
  };
}
```

**Usage Example**:

```typescript
// Transaction list endpoint
app.get(
  "/v1/transactions",
  unifiedAuthMiddleware,
  requireScope("read:transactions"),
  async (c) => {
    // Handler code
  }
);

// Transaction create endpoint
app.post(
  "/v1/transactions",
  unifiedAuthMiddleware,
  requireScope("write:transactions"),
  async (c) => {
    // Handler code
  }
);
```

### 9. Rate Limiting for Token Operations

Located in `apps/api/src/middleware/rate-limit.ts` (extend existing):

```typescript
import { RateLimiter } from "@repo/rate-limit";

// Token creation rate limit (10 per hour per user)
export const tokenCreationLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: (c) => `token-create:${c.get("userId")}`,
  message: "Too many tokens created. Please try again later.",
});

// Failed auth rate limit (100 per hour per IP)
export const failedAuthLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  keyGenerator: (c) =>
    `failed-auth:${c.req.header("x-forwarded-for") || "unknown"}`,
  message: "Too many failed authentication attempts. Please try again later.",
});
```

**Usage**:

```typescript
// Apply to token creation endpoint
app.post(
  "/v1/tokens",
  authMiddleware,
  tokenCreationLimiter
  // ... handler
);

// Track failed auth attempts in PAT middleware
// Increment counter on 401 responses
```

## Data Models

### ApiKey Model

```typescript
interface ApiKey {
  id: string; // UUID
  userId: string; // Auth.js user reference (for authentication)
  profileId: string | null; // Business logic owner (personal tokens)
  workspaceId: string | null; // Workspace-scoped tokens (future)
  name: string; // User-provided description
  keyHash: string; // SHA-256 hash of plaintext token
  last4: string; // Last 4 chars of plaintext token (for display)
  scopes: string[]; // Permission scopes (stored as JSON)
  createdAt: Date; // Creation timestamp
  updatedAt: Date; // Last modification timestamp
  lastUsedAt: Date | null; // Last authentication timestamp
  expiresAt: Date | null; // Expiration timestamp (optional)
  revokedAt: Date | null; // Soft delete timestamp
}
```

### Token Response Types

```typescript
// Token list item (no plaintext token)
interface TokenResponse {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  maskedToken: string; // e.g., "sbf_****abcd"
}

// Token creation response (includes plaintext token)
interface CreateTokenResponse extends TokenResponse {
  token: string; // Plaintext token (shown once)
}

// Error response
interface TokenErrorResponse {
  error: string;
  required?: string; // For scope errors
}
```

## Error Handling

### API Error Responses

1. **400 Bad Request** - Invalid input or validation errors

   ```json
   {
     "error": "Invalid scopes provided"
   }
   ```

2. **401 Unauthorized** - Authentication failures

   ```json
   {
     "error": "Invalid token"
   }
   ```

   ```json
   {
     "error": "Token expired"
   }
   ```

3. **403 Forbidden** - Insufficient permissions

   ```json
   {
     "error": "Insufficient permissions",
     "required": "write:transactions"
   }
   ```

4. **404 Not Found** - Token not found or not owned by user

   ```json
   {
     "error": "Token not found"
   }
   ```

5. **409 Conflict** - Duplicate token name

   ```json
   {
     "error": "Token name already exists"
   }
   ```

6. **429 Too Many Requests** - Rate limit exceeded
   ```json
   {
     "error": "Too many tokens created. Please try again later."
   }
   ```

### Web Client Error Handling

- Display validation errors inline with form fields
- Show authentication errors in toast notifications
- Provide clear guidance for scope errors
- Log errors to observability service
- Offer retry mechanisms for transient failures

## Testing Strategy

### Unit Tests

1. **Token generation** (`packages/auth/src/pat.ts`)

   - Test token format matches `sbf_<base64url>` pattern
   - Test token length is 47 characters (sbf\_ + 43 chars)
   - Test tokens are unique across multiple generations
   - Test SHA-256 hashing produces consistent output
   - Test constant-time comparison prevents timing attacks
   - **Format validator fuzz**: Reject near-miss tokens (wrong prefix, wrong length, invalid base64url chars)

2. **Scope validation** (`packages/auth/src/rbac.ts`)

   - Test valid scopes pass validation
   - Test invalid scopes fail validation
   - Test `admin` scope grants all permissions
   - Test `hasScope` correctly checks permissions

3. **Authorization header redaction** (`packages/observability/src/redactor.ts`)
   - Test `Authorization: Bearer sbf_...` is redacted in logs
   - Test any `sbf_` strings are redacted from error messages
   - Test redaction doesn't break log structure
   - **Unit test assertion**: Logs containing tokens are properly sanitized

### Integration Tests

1. **Token creation endpoint**

   - Test successful token creation returns plaintext token
   - Test duplicate name returns 409
   - Test invalid scopes return 400
   - Test rate limiting after 10 creations
   - Test token hash is stored (not plaintext)
   - Test last4 field matches plaintext token suffix
   - Test maskedToken in response uses stored last4 value

2. **Token listing endpoint**

   - Test returns all user tokens
   - Test tokens are masked correctly using stored last4 (sbf\_\*\*\*\*{last4})
   - Test masked value matches what user saw during creation
   - Test sorted by creation date (newest first)
   - Test other users' tokens not visible
   - Test revoked tokens are excluded from list

3. **Token revocation endpoint**

   - Test successful revocation soft-deletes token (sets revokedAt)
   - Test revoked token removed from active token list
   - Test revoked token still exists in database (audit trail)
   - Test other user's token returns 404
   - Test API requests with revoked token fail with 401
   - Test revocation is idempotent (DELETE twice returns 204)

4. **Token expiration flow**

   - Test user creates token with 1-day expiration
   - Test time advances 2 days (mock)
   - Test API request with expired token fails (returns 401)
   - Test clock-edge expiration: Token expiring "now + 1ms" returns 401 deterministically

5. **PAT authentication**

   - Test valid token authenticates successfully
   - Test invalid token returns 401
   - Test expired token returns 401 with `{ "error": "Token expired" }`
   - Test revoked token returns 401 with `{ "error": "Token revoked" }`
   - Test last_used_at is updated
   - Test audit sink wiring: Assert `token.created` and `token.used` events are emitted (mock Pino logger)

6. **Scope enforcement**

   - Test user creates token with `read:transactions` scope
   - Test user makes request to endpoint requiring `write:transactions`
   - Test request fails with 403 Forbidden
   - Test request to `read:transactions` endpoint succeeds
   - Test session auth bypasses scope check

7. **Database constraints**
   - Test creating token with both profileId and workspaceId fails (XOR constraint)
   - Test creating token with neither profileId nor workspaceId fails (XOR constraint)
   - Test creating token with only profileId succeeds
   - Test creating token with only workspaceId succeeds (Phase 6)

### E2E Tests

1. **Token creation flow**

   - User navigates to API Keys settings
   - User clicks "Create API Key"
   - User fills form (name, scopes, expiration)
   - User submits form
   - User sees plaintext token in modal with copy button
   - User copies token and closes modal
   - User sees new token in list (masked)

2. **Token usage flow**

   - User creates token with `read:transactions` scope
   - User makes API request with Bearer token
   - Request succeeds and returns data
   - User sees "Last used: 2 hours ago" in token list

3. **Token revocation flow**

   - User clicks "Revoke" on token
   - User confirms in dialog
   - Token removed from list
   - User makes API request with revoked token
   - Request fails with 401

4. **Scope restriction flow**
   - User creates token with `read:transactions` scope
   - User makes request to endpoint requiring `write:transactions`
   - Request fails with 403 Forbidden

## Web Client Implementation

### API Keys Settings Page

Located in `apps/web/src/pages/Settings/ApiKeys.tsx`:

**Features**:

- Token list table with columns: Name, Scopes, Created, Last Used, Expires, Actions
- "Create API Key" button opens creation modal
- Token creation modal with form (name, scopes, expiration dropdown)
- Token display modal shown after creation (plaintext token with copy button)
- Revoke button with confirmation dialog
- Usage indicators:
  - "Never used" for tokens with null lastUsedAt
  - "Last used: 2 hours ago" using date-fns for recent usage
  - Warning badge for tokens unused in 30+ days
  - Expired badge for tokens past expiration
- Relative timestamps using date-fns
- Actions buttons (Edit, Revoke)

### Token Creation Modal

**Form fields**:

- Name input (text, required, 1-100 chars)
- Scopes checkboxes (multi-select, at least one required)
- Expiration dropdown (30, 60, 90, 180, 365 days, default 90 days)
- Submit button with loading state
- Validation errors displayed inline

### Token Display Modal

**Shows**:

- Plaintext token in monospace font
- Copy button (copies to clipboard)
- Warning message: "Save this token now. You won't be able to see it again."
- "I've saved this token" checkbox (required before close)
- Close button (disabled until checkbox checked)

### Token List Component

**Displays tokens in a table**:

- Masked token value (sbf\_\*\*\*\*{last4})
- Scope badges
- Relative timestamps (using date-fns)
- Usage indicator:
  - "Never used" for tokens with null lastUsedAt
  - "Last used: 2 hours ago" for recent usage
  - Warning badge for tokens unused in 30+ days
- Revoke button with confirmation dialog
  - n te" o "Revoklicks - User c
    ion flow\*\*n revocatke

3. **Tobidden
   ors with 403 Ft fail- Requess`   ionansact:trte`wriingint requirpoest to endakes requ- User m  
    returns dataand st succeeds Requeen
   -h Bearer tokwitI request ser makes AP- U scope
   ransactions`with `read:tes token User creatflow**
   -sage 2. \*\*Token u(masked)

list n in w tokeUser sees ne - es modal
en and closokies t User cop -ton
y butith copn wkeext toaintes plse - User bmits form

- User su)
  xpiration, scopes, es form (nameer fill
  - Us" API KeyCreateclicks "
  - User ttingseys seo API Kes tigater nav Us -w**
    reation floen c **Tok1.2E Tests

# E

##issionsall permpe grants t admin sco - Tes
checkses scope h bypassession autst - Te3
turns 40pe rerequired scon without keest toeeds

- Tprocect scope th corrtoken wi
- Test t**cemene enforopSc. **s 401

5n returnkemed toalfor - Test m updated
isst_used_at - Test la 401
returnsd token Test expire -
ns 401turoken realid t - Test invssfully
succethenticatesn auokeid tval - Test ation**
AT authentic **P4.rns 404

retunt tokennon-existeking t revo - Tes 404
rnsretur's token ther useoking ost revTe

## Data

Models

### ApiKey Model

```typescript
interface ApiKey {
  id: string; // CUID
  userId: string; // Owner user ID
  name: string; // User-provided description
  tokenHash: string; // SHA-256 hash of plaintext token
  scopes: string[]; // Permission scopes
  createdAt: Date; // Creation timestamp
  lastUsedAt: Date | null; // Last authentication timestamp
  expiresAt: Date; // Expiration timestamp
}
```

### Token Response Types

```typescript
// Token list item (no plaintext token)
interface TokenResponse {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  maskedToken: string; // e.g., "sbf_****abcd"
}

// Token creation response (includes plaintext token)
interface CreateTokenResponse extends TokenResponse {
  token: string; // Plaintext token (shown once)
}
```

## Error Handling

### API Error Responses

1. **400 Bad Request** - Invalid input

   ```json
   { "error": "Invalid scopes provided" }
   ```

2. **401 Unauthorized** - Authentication failures

   ```json
   { "error": "Invalid token" }
   { "error": "Token expired" }
   { "error": "Token revoked" }
   ```

3. **403 Forbidden** - Insufficient permissions

   ```json
   { "error": "Insufficient permissions", "required": "write:transactions" }
   ```

4. **404 Not Found** - Token not found or not owned by user

   ```json
   { "error": "Token not found" }
   ```

5. **409 Conflict** - Duplicate token name

   ```json
   { "error": "Token name already exists" }
   ```

6. **410 Gone** - Token already revoked

   ```json
   { "error": "Token already revoked" }
   ```

7. **429 Too Many Requests** - Rate limit exceeded
   ```json
   { "error": "Too many tokens created. Please try again later." }
   ```

**Error Code Standardization (Phase 11)**:

- Current string-based errors are sufficient for Phase 3
- Phase 11 (OpenAPI spec generation) will introduce error codes:
  - `ERR_INVALID_TOKEN`, `ERR_TOKEN_EXPIRED`, `ERR_INSUFFICIENT_SCOPE`, etc.
  - Defined in `@repo/types/errors.ts`
  - Enables consistent error documentation across API

## Testing Strategy

### Unit Tests

- Token generation and hashing
- Scope validation
- Constant-time comparison

### Integration Tests

- Token CRUD operations
- PAT authentication
- Scope enforcement
- Rate limiting

### E2E Tests

- Token creation flow
- Token usage with API
- Token revocation
- Scope restrictions

## Security Considerations

### Token Security

- 256 bits of entropy (cryptographically secure)
- SHA-256 one-way hashing
- Constant-time comparison (prevents timing attacks)
- Plaintext shown once only
- Token prefix `sbf_` enables secret scanning (GitHub, GitGuardian, etc.)

### API Security

- Rate limiting (10 tokens/hour per user, 100 failed auth/hour per IP)
- Scope-based least privilege
- Audit logging for all token operations
- Generic error messages (prevents enumeration)
- Token expiration enforcement (default 90 days, configurable 1-365 days)

### Storage Security

- Only hash stored in database (plaintext never persisted)
- Last 4 characters stored separately for display (doesn't reveal entropy)
- Indexed for fast lookup
- Cascade delete on user/profile deletion
- Unique constraints prevent duplicates
- **Soft delete policy**: Revoked tokens kept indefinitely for audit trail (revokedAt timestamp)
  - Hard deletion only for GDPR/compliance requests via explicit scripts
  - Aligns with Phase 12 observability and Phase 17 compliance requirements

### Workspace Token Validation

- Schema supports `workspaceId` for future Phase 6 implementation
- Current implementation: All tokens are personal (profileId only)
- **XOR constraint enforced at database level**: `CHECK ((profileId IS NOT NULL)::int + (workspaceId IS NOT NULL)::int = 1)`
  - Prevents invalid states (both null, both set)
  - Avoids backfills when Phase 6 adds workspace tokens
- Phase 6 will add workspace token creation flow and validation logic

### Observability Security

- **Authorization header redaction**: All logs must redact `Authorization: Bearer` headers
- **Token prefix scanning**: Redact any `sbf_` strings from logs and error messages
- Implementation: Add redactor middleware in `@repo/observability`
- Unit test: Assert that logs containing tokens are properly redacted

## Audit Logging

All token operations emit events via `authEvents` from `@repo/auth`:

```typescript
// Token created
authEvents.emit({
  type: "token.created",
  userId: "user_123",
  metadata: {
    tokenId: "tok_456",
    profileId: "prof_789",
    tokenName: "CI/CD Pipeline",
    scopes: ["read:transactions"],
    expiresAt: "2025-04-17T00:00:00Z",
    ip: "192.168.1.1",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    timestamp: "2025-01-18T10:30:00.000Z",
  },
});

// Token used
authEvents.emit({
  type: "token.used",
  userId: "user_123",
  metadata: {
    tokenId: "tok_456",
    endpoint: "/v1/transactions",
    method: "GET",
    status: 200,
    ip: "192.168.1.1",
    userAgent: "curl/7.88.1",
    timestamp: "2025-01-18T10:35:00.000Z",
  },
});

// Token revoked
authEvents.emit({
  type: "token.revoked",
  userId: "user_123",
  metadata: {
    tokenId: "tok_456",
    profileId: "prof_789",
    tokenName: "CI/CD Pipeline",
    ip: "192.168.1.1",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    timestamp: "2025-01-18T10:40:00.000Z",
  },
});

// Scope check failed
authEvents.emit({
  type: "token.scope_denied",
  userId: "user_123",
  metadata: {
    tokenId: "tok_456",
    endpoint: "/v1/transactions",
    method: "POST",
    requiredScope: "write:transactions",
    providedScopes: ["read:transactions", "read:budgets"],
    ip: "192.168.1.1",
    userAgent: "Mozilla/5.0...",
    timestamp: "2025-01-18T10:45:00.000Z",
  },
});

// Failed authentication attempt
authEvents.emit({
  type: "token.auth_failed",
  reason: "not_found", // or "invalid_format", "revoked", "expired"
  tokenPrefix: "sbf_abcd", // Only first 8 chars for security
  tokenId: "tok_456", // Only present if token was found but invalid
  userId: "user_123", // Only present if token was found
  ip: "192.168.1.1",
  userAgent: "curl/7.64.1",
  timestamp: "2025-01-18T10:50:00.000Z",
});
```

**Audit Log Destination**:

- Events are emitted via `authEvents` event emitter (established in Phase 2)
- Phase 2 wired `authEvents` to Pino structured logger in `@repo/observability`
- Logs are written to stdout (captured by Vercel/production logging)
- Phase 12 will add Sentry integration and log aggregation (Logtail)
- No additional wiring needed for Phase 3 - audit trail is already operational

## Migration Path

### Phase 1: Database Schema

1. Add `ApiKey` model to Prisma schema
2. Add `apiKeys` relation to `User` model
3. Run migration: `pnpm db:migrate`

### Phase 2: Core Services

1. Implement token generation in `@repo/auth`
2. Add scope definitions to `@repo/auth`
3. Create token schemas in `@repo/types`

### Phase 3: API Routes

1. Implement token CRUD endpoints
2. Add PAT authentication middleware
3. Add scope enforcement middleware
4. Update existing routes to use unified auth

### Phase 4: Web Client

1. Create API Keys settings page
2. Implement token creation modal
3. Implement token display modal
4. Add token list with revocation

### Phase 5: Testing & Documentation

1. Write unit tests for token utilities
2. Write integration tests for API endpoints
3. Write E2E tests for web flows
4. Update API documentation with Bearer auth examples

## Future Enhancements

### Phase 3.1: Advanced Features (Post-Launch)

- **Token usage analytics dashboard**: Consider `token_usage_log` table for per-day aggregates instead of only `lastUsedAt`
- **Bulk token operations**: Revoke all, revoke unused (30+ days)
- **Token rotation**: Generate new token, revoke old (atomic operation)
- **IP allowlisting**: Per-token IP restrictions
- **Webhook signing**: Token-specific secrets for webhook verification

### Phase 3.2: Enterprise Features (Phase 6+)

- **Team-level tokens**: Workspace-scoped tokens (workspaceId) with member permissions
- **Token templates**: Predefined scope sets (e.g., "Read-Only", "Full Access")
- **Token approval workflows**: Require admin approval for sensitive scopes
- **Token usage quotas**: Rate limits per token (not just per user)
- **Audit log export**: CSV/JSON export for compliance (Phase 12)

### Phase 4+: Scope Evolution

- **Scope versioning**: Consider `v1:read:transactions` if breaking changes needed
- **Dynamic scopes**: Plaid-specific scopes (e.g., `read:plaid:transactions`, `write:plaid:sync`)
- **Resource-level scopes**: Per-account or per-workspace scoping (e.g., `read:accounts:acc_123`)
- **Secret prefix registry**: Centralize all secret prefixes (`sbf_`, `plaid_`, `stripe_`, `ws_link_`) in `packages/auth/src/prefixes.ts`

### Deployment Considerations

- **Edge runtime compatibility**: Current implementation uses `node:crypto` (Node adapter only)
  - For edge deployment: swap to `crypto.subtle.digest('SHA-256', ...)` (Web Crypto API)
  - Token format remains identical (sbf\_ prefix + base64url)
  - Defer until Phase 17 (production deployment planning)
  - One-line change in `packages/auth/src/pat.ts`

### Error Code Standardization

- **Phase 11 preparation**: Define error codes in `@repo/types/errors.ts`
  - Example: `ERR_INVALID_TOKEN`, `ERR_TOKEN_EXPIRED`, `ERR_INSUFFICIENT_SCOPE`
  - Enables OpenAPI spec to document error responses uniformly
  - Current string errors are fine for Phase 3, refactor during Phase 11

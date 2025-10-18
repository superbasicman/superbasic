# Design Document

## Overview

The API Key Management system enables users to generate Personal Access Tokens (PATs) for programmatic API access. This design builds on the session authentication foundation from Phase 2, adding a parallel authentication path for Bearer tokens. The system implements industry-standard security practices including cryptographically secure token generation, SHA-256 hashing, scope-based permissions, and comprehensive audit logging.

**Key Design Principles**:
- **Separation of Concerns**: PAT authentication is separate from session authentication (different middleware, different token formats)
- **Security First**: Plaintext tokens shown once, SHA-256 hashing, constant-time comparison, rate limiting
- **Least Privilege**: Scope-based permissions restrict token capabilities
- **Auditability**: All token operations logged with full context
- **Developer Experience**: Clear token format (`sbf_` prefix), helpful error messages, usage analytics

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
  id          String    @id @default(cuid())
  userId      String
  name        String    // User-provided description (e.g., "CI/CD Pipeline", "Mobile App")
  tokenHash   String    @unique // SHA-256 hash of the plaintext token
  scopes      String[]  // Array of permission scopes
  createdAt   DateTime  @default(now())
  lastUsedAt  DateTime? // Updated on each successful authentication
  expiresAt   DateTime  // Token expiration timestamp
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
  @@index([tokenHash]) // Fast lookup during authentication
  @@unique([userId, name]) // Prevent duplicate names per user
  @@map("api_keys")
}
```

Update `User` model to include relation:

```prisma
model User {
  // ... existing fields
  apiKeys ApiKey[]
}
```

**Migration Notes**:
- `tokenHash` is indexed for fast authentication lookups
- `userId` is indexed for efficient user token listing
- Unique constraint on `[userId, name]` prevents duplicate token names per user
- `onDelete: Cascade` ensures tokens are deleted when user is deleted

### 2. Token Generation Service

Located in `packages/auth/src/pat.ts`:

```typescript
import crypto from "node:crypto"

/**
 * Token format: sbf_<base64url>
 * - sbf_ prefix enables secret scanning in code repositories
 * - 32 bytes of entropy = 256 bits (cryptographically secure)
 * - base64url encoding (URL-safe, no padding)
 */
export function generateToken(): string {
  const bytes = crypto.randomBytes(32)
  const base64url = bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
  
  return `sbf_${base64url}`
}

/**
 * Hash token using SHA-256
 * Stored in database for verification
 */
export function hashToken(token: string): string {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex")
}

/**
 * Verify token against stored hash using constant-time comparison
 * Prevents timing attacks
 */
export function verifyToken(token: string, hash: string): boolean {
  const tokenHash = hashToken(token)
  return crypto.timingSafeEqual(
    Buffer.from(tokenHash),
    Buffer.from(hash)
  )
}

/**
 * Validate token format
 * Returns true if token matches sbf_<base64url> pattern
 */
export function isValidTokenFormat(token: string): boolean {
  return /^sbf_[A-Za-z0-9_-]{43}$/.test(token)
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
] as const

export type Scope = typeof VALID_SCOPES[number]

/**
 * Check if a set of scopes includes a required scope
 * "admin" scope grants all permissions
 */
export function hasScope(userScopes: string[], requiredScope: Scope): boolean {
  return userScopes.includes("admin") || userScopes.includes(requiredScope)
}

/**
 * Validate that all provided scopes are valid
 */
export function validateScopes(scopes: string[]): boolean {
  return scopes.every(scope => VALID_SCOPES.includes(scope as Scope))
}

/**
 * Endpoint to scope mapping
 * Used by scope enforcement middleware
 */
export const ENDPOINT_SCOPES: Record<string, { method: string; scope: Scope }[]> = {
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
}
```

**Scope Design**:
- Granular permissions (read vs write, per resource)
- `admin` scope grants full access (for internal tools)
- Endpoint mapping enables automatic scope enforcement
- Session auth bypasses scope checks (full access)


### 4. API Route Schemas

Located in `packages/types/src/token.schema.ts`:

```typescript
import { z } from "zod"
import { VALID_SCOPES } from "@repo/auth"

export const CreateTokenSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(VALID_SCOPES)).min(1),
  expiresInDays: z.number().int().min(1).max(365).optional().default(90),
})

export const UpdateTokenSchema = z.object({
  name: z.string().min(1).max(100),
})

export const TokenResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  scopes: z.array(z.string()),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string(),
  maskedToken: z.string(), // Only last 4 chars visible
})

export const CreateTokenResponseSchema = TokenResponseSchema.extend({
  token: z.string(), // Plaintext token (shown once)
})

export type CreateTokenInput = z.infer<typeof CreateTokenSchema>
export type UpdateTokenInput = z.infer<typeof UpdateTokenSchema>
export type TokenResponse = z.infer<typeof TokenResponseSchema>
export type CreateTokenResponse = z.infer<typeof CreateTokenResponseSchema>
```

### 5. API Routes Implementation

**Create Token Route** (`apps/api/src/routes/v1/tokens/create.ts`):

```typescript
import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { CreateTokenSchema } from "@repo/types"
import { generateToken, hashToken, validateScopes } from "@repo/auth"
import { prisma } from "@repo/database"
import { authMiddleware } from "../../../middleware/auth"
import { authEvents } from "@repo/auth"

const createTokenRoute = new Hono()

createTokenRoute.post(
  "/",
  authMiddleware, // Requires session auth
  zValidator("json", CreateTokenSchema),
  async (c) => {
    const userId = c.get("userId")
    const { name, scopes, expiresInDays } = c.req.valid("json")
    
    // Validate scopes
    if (!validateScopes(scopes)) {
      return c.json({ error: "Invalid scopes provided" }, 400)
    }
    
    // Check for duplicate name
    const existing = await prisma.apiKey.findUnique({
      where: { userId_name: { userId, name } }
    })
    
    if (existing) {
      return c.json({ error: "Token name already exists" }, 409)
    }
    
    // Generate token and hash
    const token = generateToken()
    const tokenHash = hashToken(token)
    
    // Calculate expiration
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiresInDays)
    
    // Create token record
    const apiKey = await prisma.apiKey.create({
      data: {
        userId,
        name,
        tokenHash,
        scopes,
        expiresAt,
      },
    })
    
    // Emit audit event
    authEvents.emit({
      type: "token.created",
      userId,
      metadata: {
        tokenId: apiKey.id,
        tokenName: name,
        scopes,
        expiresAt: expiresAt.toISOString(),
      },
    })
    
    // Return plaintext token (only time it's shown)
    return c.json({
      token, // Plaintext - user must save this
      id: apiKey.id,
      name: apiKey.name,
      scopes: apiKey.scopes,
      createdAt: apiKey.createdAt.toISOString(),
      lastUsedAt: null,
      expiresAt: apiKey.expiresAt.toISOString(),
      maskedToken: `sbf_****${token.slice(-4)}`,
    }, 201)
  }
)

export { createTokenRoute }
```

**List Tokens Route** (`apps/api/src/routes/v1/tokens/list.ts`):

```typescript
import { Hono } from "hono"
import { prisma } from "@repo/database"
import { authMiddleware } from "../../../middleware/auth"

const listTokensRoute = new Hono()

listTokensRoute.get("/", authMiddleware, async (c) => {
  const userId = c.get("userId")
  
  const tokens = await prisma.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      scopes: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      tokenHash: true, // Only for masking
    },
  })
  
  // Mask tokens (show last 4 chars of hash)
  const maskedTokens = tokens.map(token => ({
    id: token.id,
    name: token.name,
    scopes: token.scopes,
    createdAt: token.createdAt.toISOString(),
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    expiresAt: token.expiresAt.toISOString(),
    maskedToken: `sbf_****${token.tokenHash.slice(-4)}`,
  }))
  
  return c.json({ tokens: maskedTokens })
})

export { listTokensRoute }
```

**Revoke Token Route** (`apps/api/src/routes/v1/tokens/revoke.ts`):

```typescript
import { Hono } from "hono"
import { prisma } from "@repo/database"
import { authMiddleware } from "../../../middleware/auth"
import { authEvents } from "@repo/auth"

const revokeTokenRoute = new Hono()

revokeTokenRoute.delete("/:id", authMiddleware, async (c) => {
  const userId = c.get("userId")
  const tokenId = c.req.param("id")
  
  // Find token and verify ownership
  const token = await prisma.apiKey.findUnique({
    where: { id: tokenId },
  })
  
  if (!token) {
    return c.json({ error: "Token not found" }, 404)
  }
  
  if (token.userId !== userId) {
    return c.json({ error: "Token not found" }, 404) // Don't leak existence
  }
  
  // Delete token
  await prisma.apiKey.delete({
    where: { id: tokenId },
  })
  
  // Emit audit event
  authEvents.emit({
    type: "token.revoked",
    userId,
    metadata: {
      tokenId,
      tokenName: token.name,
    },
  })
  
  return c.body(null, 204)
})

export { revokeTokenRoute }
```

**Update Token Route** (`apps/api/src/routes/v1/tokens/update.ts`):

```typescript
import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { UpdateTokenSchema } from "@repo/types"
import { prisma } from "@repo/database"
import { authMiddleware } from "../../../middleware/auth"

const updateTokenRoute = new Hono()

updateTokenRoute.patch(
  "/:id",
  authMiddleware,
  zValidator("json", UpdateTokenSchema),
  async (c) => {
    const userId = c.get("userId")
    const tokenId = c.req.param("id")
    const { name } = c.req.valid("json")
    
    // Find token and verify ownership
    const token = await prisma.apiKey.findUnique({
      where: { id: tokenId },
    })
    
    if (!token || token.userId !== userId) {
      return c.json({ error: "Token not found" }, 404)
    }
    
    // Check for duplicate name
    const existing = await prisma.apiKey.findUnique({
      where: { userId_name: { userId, name } }
    })
    
    if (existing && existing.id !== tokenId) {
      return c.json({ error: "Token name already exists" }, 409)
    }
    
    // Update token
    const updated = await prisma.apiKey.update({
      where: { id: tokenId },
      data: { name },
    })
    
    return c.json({
      id: updated.id,
      name: updated.name,
      scopes: updated.scopes,
      createdAt: updated.createdAt.toISOString(),
      lastUsedAt: updated.lastUsedAt?.toISOString() ?? null,
      expiresAt: updated.expiresAt.toISOString(),
      maskedToken: `sbf_****${updated.tokenHash.slice(-4)}`,
    })
  }
)

export { updateTokenRoute }
```


### 6. PAT Authentication Middleware

Located in `apps/api/src/middleware/pat.ts`:

```typescript
import type { Context, Next } from "hono"
import { hashToken, isValidTokenFormat, verifyToken } from "@repo/auth"
import { prisma } from "@repo/database"

/**
 * PAT authentication middleware
 * Extracts Bearer token from Authorization header, verifies against database
 * Attaches user context and token scopes to request
 */
export async function patMiddleware(c: Context, next: Next) {
  try {
    // Extract Bearer token from Authorization header
    const authHeader = c.req.header("Authorization")
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid Authorization header" }, 401)
    }
    
    const token = authHeader.substring(7) // Remove "Bearer " prefix
    
    // Validate token format before database lookup
    if (!isValidTokenFormat(token)) {
      return c.json({ error: "Invalid token format" }, 401)
    }
    
    // Hash token and lookup in database
    const tokenHash = hashToken(token)
    
    const apiKey = await prisma.apiKey.findUnique({
      where: { tokenHash },
      include: { user: true },
    })
    
    if (!apiKey) {
      return c.json({ error: "Invalid token" }, 401)
    }
    
    // Check expiration
    if (apiKey.expiresAt < new Date()) {
      return c.json({ error: "Token expired" }, 401)
    }
    
    // Update last used timestamp (fire and forget)
    prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    }).catch(err => {
      console.error("Failed to update token lastUsedAt:", err)
    })
    
    // Attach user context and token metadata
    c.set("userId", apiKey.userId)
    c.set("userEmail", apiKey.user.email)
    c.set("authType", "pat")
    c.set("tokenId", apiKey.id)
    c.set("tokenScopes", apiKey.scopes)
    
    await next()
  } catch (error) {
    console.error("PAT middleware error:", error)
    return c.json({ error: "Unauthorized" }, 401)
  }
}
```

**Design Notes**:
- Token format validation before database lookup (prevents injection)
- Constant-time comparison via `verifyToken` (prevents timing attacks)
- Last used timestamp updated asynchronously (doesn't block request)
- Generic error messages (prevents user enumeration)

### 7. Unified Authentication Middleware

Located in `apps/api/src/middleware/auth-unified.ts`:

```typescript
import type { Context, Next } from "hono"
import { authMiddleware } from "./auth"
import { patMiddleware } from "./pat"

/**
 * Unified authentication middleware
 * Tries session auth first (cookie), then PAT auth (Bearer token)
 * Use this on routes that accept both authentication methods
 */
export async function unifiedAuthMiddleware(c: Context, next: Next) {
  // Check for session cookie first
  const hasCookie = c.req.header("Cookie")?.includes("__Host-sbfin_auth") || 
                    c.req.header("Cookie")?.includes("__sbfin_auth")
  
  if (hasCookie) {
    return authMiddleware(c, next)
  }
  
  // Check for Bearer token
  const hasBearer = c.req.header("Authorization")?.startsWith("Bearer ")
  
  if (hasBearer) {
    return patMiddleware(c, next)
  }
  
  return c.json({ error: "Unauthorized" }, 401)
}
```

**Usage**:
- Use `authMiddleware` for web-only routes (e.g., token management)
- Use `patMiddleware` for API-only routes (e.g., webhooks)
- Use `unifiedAuthMiddleware` for routes that accept both (e.g., transactions, budgets)

### 8. Scope Enforcement Middleware

Located in `apps/api/src/middleware/scopes.ts`:

```typescript
import type { Context, Next } from "hono"
import { hasScope, type Scope } from "@repo/auth"

/**
 * Scope enforcement middleware factory
 * Verifies token has required scope for the operation
 * Session auth bypasses scope checks (full access)
 */
export function requireScope(requiredScope: Scope) {
  return async (c: Context, next: Next) => {
    const authType = c.get("authType")
    
    // Session auth has full access (bypass scope check)
    if (authType === "session") {
      return next()
    }
    
    // PAT auth requires scope check
    if (authType === "pat") {
      const tokenScopes = c.get("tokenScopes") as string[]
      
      if (!hasScope(tokenScopes, requiredScope)) {
        return c.json({
          error: "Insufficient permissions",
          required: requiredScope,
        }, 403)
      }
      
      return next()
    }
    
    // No auth type set (shouldn't happen if auth middleware ran)
    return c.json({ error: "Unauthorized" }, 401)
  }
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
)

// Transaction create endpoint
app.post(
  "/v1/transactions",
  unifiedAuthMiddleware,
  requireScope("write:transactions"),
  async (c) => {
    // Handler code
  }
)
```

### 9. Rate Limiting for Token Operations

Located in `apps/api/src/middleware/rate-limit.ts` (extend existing):

```typescript
import { RateLimiter } from "@repo/rate-limit"

// Token creation rate limit (10 per hour per user)
export const tokenCreationLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: (c) => `token-create:${c.get("userId")}`,
  message: "Too many tokens created. Please try again later.",
})

// Failed auth rate limit (100 per hour per IP)
export const failedAuthLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  keyGenerator: (c) => `failed-auth:${c.req.header("x-forwarded-for") || "unknown"}`,
  message: "Too many failed authentication attempts. Please try again later.",
})
```

**Usage**:

```typescript
// Apply to token creation endpoint
app.post(
  "/v1/tokens",
  authMiddleware,
  tokenCreationLimiter,
  // ... handler
)

// Track failed auth attempts in PAT middleware
// Increment counter on 401 responses
```


## Data Models

### ApiKey Model

```typescript
interface ApiKey {
  id: string              // CUID
  userId: string          // Owner user ID
  name: string            // User-provided description
  tokenHash: string       // SHA-256 hash of plaintext token
  scopes: string[]        // Permission scopes
  createdAt: Date         // Creation timestamp
  lastUsedAt: Date | null // Last authentication timestamp
  expiresAt: Date         // Expiration timestamp
}
```

### Token Response Types

```typescript
// Token list item (no plaintext token)
interface TokenResponse {
  id: string
  name: string
  scopes: string[]
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string
  maskedToken: string // e.g., "sbf_****abcd"
}

// Token creation response (includes plaintext token)
interface CreateTokenResponse extends TokenResponse {
  token: string // Plaintext token (shown once)
}

// Error response
interface TokenErrorResponse {
  error: string
  required?: string // For scope errors
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
   - Test token length is 47 characters (sbf_ + 43 chars)
   - Test tokens are unique across multiple generations
   - Test SHA-256 hashing produces consistent output
   - Test constant-time comparison prevents timing attacks

2. **Scope validation** (`packages/auth/src/rbac.ts`)
   - Test valid scopes pass validation
   - Test invalid scopes fail validation
   - Test `admin` scope grants all permissions
   - Test `hasScope` correctly checks permissions

### Integration Tests

1. **Token creation endpoint**
   - Test successful token creation returns plaintext token
   - Test duplicate name returns 409
   - Test invalid scopes return 400
   - Test rate limiting after 10 creations
   - Test token hash is stored (not plaintext)

2. **Token listing endpoint**
   - Test returns all user tokens
   - Test tokens are masked correctly
   - Test sorted by creation date (newest first)
   - Test other users' tokens not visible

3. **Token revocation endpoint**
   - Test successful revocation deletes token
   - 
```

singclor ned aftee reopenot bCan// - button
oken" ved my t've sa
// - "Ient saving tokssage abourning me Waoard)
// -lipbopies to cton (copy but// - Cfont
monospace in token ntext 
// - Plai/ Shows:
}

/> void() =lose: lean
  onCen: boong
  isOpken: strips {
  toplayModalProce TokenDisrfapt
inteypescril

```ty Modaoken Displa`

### Tnline
``layed irs dispdation erroalie
// - Vading stat with loubmit button S
// - 90 days) (defaultropdownon dxpirati)
// - Ee required(at least onxes ckboe che/ - Scophars)
/-100 cquired, 1me input (re
// - Na Form with:
//
}
ide) => voResponseateToken (token: CrnSuccess:oid
  oe: () => vClosean
  on boolen: isOp
  {teModalProps TokenCreat
interface`typescripodal

``Creation M# Token 

##
```ired tokensd/expnuse urs forindicatoarning // - Wvoke)
dit, Reons (Eion butt Act-fns)
// -using datetimestamps ( - Relative e badges
//// - Scopalue
sked token v/ - Math:
/e wis in a tabltokenDisplays id
}

// ) => voname: string, stringId: : (token onEdit void
 tring) => sd:nIoke (tRevoke:on]
  onse[TokenResp  tokens: stProps {
okenLi
interface Tipt``typescrent

`Compon List 

### Tokened badge)dicator (rken ined toys
- Expired in 30+ daens unusor tok badge fWarning
  - t usage for receno"2 hours aged  - "Last ussedAt
 stUh null las witr tokened" fo- "Never usors:
  age indicatUsog
- dialmation th confiron wie buttse
- Revokcloutton to y token" bI've saved mn."
  - "it agaile to see n't be abou wow. Yno token  "Save thisrning: Watton
  -copy buken with ext toint Pla  -ation):
ter crewn af (shoplay modalToken dis)
- ays180, 365 d90, , wn: 30, 60opdotion (dr- Expira
  kboxes)lect checulti-se(mes - Scopnput)
  t i (tex- Namefields:
  form h al witn modtioToken creal
- modaton opens  Key" butAPI- "Create tions
 Expires, Aced,, Last Us, CreatedName, Scopesmns: th colu wiist table- Token l*:
Features***s.tsx`:

tings/ApiKeyc/pages/Set`apps/web/sr in 
Located
gs Pageineys SettI K
### APn
iolementatt Imp Clieneb# W
#
ith 401)s wt (fails API requesmakeer  Us   -(mock)
ces 2 days dvan
   - Time aeeds)equest (succ rPIr makes A
   - Userationexpiy -datoken with 1ates ser cre
   - U**lowxpiration f4. **Token eurn 401

etken rd toth revokeequests wiAPI r
   - listfrom s removed n i
   - Tokeion revocatnfirmsUser cooken
   - n te" o "Revoklicks  - User c
 ion flow**n revocatke
3. **Tobidden
ors with 403 Ft fail- Requess`
   ionansact:trte `wriingint requirpoest to endakes requ- User m  
 returns dataand st succeeds  Requeen
   -h Bearer tokwitI request ser makes AP- U   scope
 ransactions`with `read:tes token  User creatflow**
   -sage 2. **Token u(masked)

list n in w tokeUser sees ne - es modal
  en and closokies t User cop  -ton
 y butith copn wkeext toaintes plse   - User bmits form
 - User su)
  xpiration, scopes, es form (nameer fill
   - Us" API KeyCreateclicks "
   - User ttingseys seo API Kes tigater nav Us -w**
  reation floen c **Tok1.2E Tests

# E

##issionsall permpe grants t admin sco - Tes
  checkses scope h bypassession autst   - Te3
 turns 40pe rerequired scon without keest toeeds
   - Tprocect scope th corrtoken wi
   - Test t**cemene enforopSc. **s 401

5n returnkemed toalfor - Test m updated
  isst_used_at   - Test la 401
 returnsd token Test expire - 
  ns 401turoken realid t  - Test invssfully
  succethenticatesn auokeid tval   - Test ation**
AT authentic **P4.rns 404

 retunt tokennon-existeking t revo   - Tes 404
rnsretur's token ther useoking ost revTe
## Data
 Models

### ApiKey Model

```typescript
interface ApiKey {
  id: string              // CUID
  userId: string          // Owner user ID
  name: string            // User-provided description
  tokenHash: string       // SHA-256 hash of plaintext token
  scopes: string[]        // Permission scopes
  createdAt: Date         // Creation timestamp
  lastUsedAt: Date | null // Last authentication timestamp
  expiresAt: Date         // Expiration timestamp
}
```

### Token Response Types

```typescript
// Token list item (no plaintext token)
interface TokenResponse {
  id: string
  name: string
  scopes: string[]
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string
  maskedToken: string // e.g., "sbf_****abcd"
}

// Token creation response (includes plaintext token)
interface CreateTokenResponse extends TokenResponse {
  token: string // Plaintext token (shown once)
}
```

## Error Handling

### API Error Responses

1. **400 Bad Request** - Invalid input
2. **401 Unauthorized** - Authentication failures
3. **403 Forbidden** - Insufficient permissions
4. **404 Not Found** - Token not found
5. **409 Conflict** - Duplicate token name
6. **429 Too Many Requests** - Rate limit exceeded

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
- Token prefix enables secret scanning

### API Security
- Rate limiting (10 tokens/hour per user, 100 failed auth/hour per IP)
- Scope-based least privilege
- Audit logging for all token operations
- Generic error messages (prevents enumeration)
- Token expiration enforcement

### Storage Security
- Only hash stored in database
- Indexed for fast lookup
- Cascade delete on user deletion
- Unique constraints prevent duplicates

## Audit Logging

All token operations emit events via `authEvents`:

```typescript
// Token created
authEvents.emit({
  type: "token.created",
  userId: "user_123",
  metadata: {
    tokenId: "tok_456",
    tokenName: "CI/CD Pipeline",
    scopes: ["read:transactions"],
    expiresAt: "2025-04-17T00:00:00Z",
  },
})

// Token used
authEvents.emit({
  type: "token.used",
  userId: "user_123",
  metadata: {
    tokenId: "tok_456",
    endpoint: "/v1/transactions",
    method: "GET",
    ip: "192.168.1.1",
  },
})

// Token revoked
authEvents.emit({
  type: "token.revoked",
  userId: "user_123",
  metadata: {
    tokenId: "tok_456",
    tokenName: "CI/CD Pipeline",
  },
})

// Scope check failed
authEvents.emit({
  type: "token.scope_denied",
  userId: "user_123",
  metadata: {
    tokenId: "tok_456",
    requiredScope: "write:transactions",
    endpoint: "/v1/transactions",
  },
})
```

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

### Phase 3.1: Advanced Features
- Token usage analytics dashboard
- Bulk token operations (revoke all, revoke unused)
- Token rotation (generate new token, revoke old)
- IP allowlisting per token
- Webhook signing with token secrets

### Phase 3.2: Enterprise Features
- Team-level tokens (shared across workspace)
- Token templates (predefined scope sets)
- Token approval workflows
- Token usage quotas and alerts
- Audit log export for compliance


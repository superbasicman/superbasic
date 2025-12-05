# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SuperBasic Finance is an API-first personal finance platform built as a monorepo. The web client is a thin React SPA that exclusively consumes a typed JSON API. Currently implementing OAuth 2.1 authorization flow for authentication with a long-term goal of providing a full OAuth 2.1/OIDC authorization server.

**Current Phase:** Phase 3.5 (Architecture Refactor) - Service/Repository pattern implementation
**Main Branch:** `main` | **Current Branch:** `dev`

## Essential Commands

### Development
```bash
# Start all apps (API on :3000, Web on :5173)
pnpm dev

# Start specific app
pnpm dev --filter=api
pnpm dev --filter=web

# Start API with test database
pnpm --filter=@repo/api dev:test
```

### Testing
```bash
# Run all tests (uses .env.test for API tests)
pnpm test

# Watch mode for development
pnpm test:watch

# Run specific test file
pnpm --filter=@repo/api test src/routes/v1/__tests__/me.test.ts

# E2E tests (auto-starts servers)
pnpm --filter=@repo/web test:e2e:run

# E2E with specific file
pnpm --filter=@repo/web test:e2e:run auth.spec.ts
```

### Database
```bash
# Generate Prisma client (must run after schema changes)
pnpm db:generate

# Run migrations (options: test, local, prod)
pnpm db:migrate --target local

# Open Prisma Studio
pnpm db:studio

# Seed OAuth client (required for OAuth flows)
pnpm db:seed --target test  # For local test DB
pnpm db:seed --target local # For dev env (Neon branch)

# Reset database (wipes data and reseeds)
pnpm db:reset --target local
```

### Code Quality
```bash
# Lint and type-check
pnpm lint
pnpm typecheck

# Format with Biome
pnpm format
```

### Build
```bash
# Build all packages and apps
pnpm build

# Build specific package
pnpm build --filter=@repo/core
```

## Architecture

### High-Level Structure

The system follows a **strict three-layer architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────────┐
│  apps/api  (Hono HTTP Server)                   │
│  HTTP LAYER (Thin Controllers)                  │
│  - Parse/validate HTTP requests (Zod)           │
│  - Call service layer methods                   │
│  - Format HTTP responses                        │
│  - Map domain errors to HTTP status codes       │
│  - Apply middleware (auth, rate limit, CORS)    │
│  Target: < 30 lines per route handler           │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  packages/auth-core  (Auth Business Logic)      │
│  - OAuth 2.1 authorization & token management   │
│  - Session & refresh token handling             │
│  - PKCE, JWT signing, token service             │
│  - VerifiedIdentity normalization               │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  packages/core  (Domain Business Logic)         │
│  SERVICE LAYER                                  │
│  - Implement business rules and workflows       │
│  - Orchestrate multiple repository calls        │
│  - Validate business constraints                │
│  - Emit domain events for audit logging         │
│  - Return domain objects (not HTTP responses)   │
│  - Throw domain-specific errors                 │
│  Domains: tokens, profiles, users               │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  packages/core  (Data Access)                   │
│  REPOSITORY LAYER                               │
│  - Pure Prisma operations (CRUD only)           │
│  - No business logic or validation              │
│  - Return Prisma entities                       │
│  - Handle database-specific errors              │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  packages/database  (Prisma)                    │
│  - Schema definition                            │
│  - Migrations                                   │
│  - Generated client                             │
│  - RLS policies (future)                        │
└─────────────────────────────────────────────────┘
```

### Authentication Architecture (End-State Goal)

**Source of Truth:** `docs/auth-migration/end-auth-goal.md`

The authentication system is being evolved toward a full OAuth 2.1/OIDC authorization server. The end-state architecture separates:

1. **Identity Providers (IdPs)**
   - First-party IdP: email/password and magic-link authentication
   - External IdPs: Google OIDC (currently), GitHub/Apple (future)
   - All IdPs normalized to `VerifiedIdentity` abstraction

2. **Auth-Core** (`packages/auth-core`)
   - Normalizes IdP assertions into `VerifiedIdentity` objects
   - Issues and validates all tokens (access, refresh, PATs)
   - Maintains users, workspaces, memberships, service identities
   - Exposes OAuth 2.1 endpoints (`/oauth/authorize`, `/oauth/token`, etc.)

3. **Application API** (`apps/api`)
   - Receives tokens/cookies, validates with auth-core
   - Constructs `AuthContext` for all downstream business logic
   - Sets Postgres GUCs for RLS enforcement (future)

**Current OAuth 2.1 Flow (v1/MVP):**

1. User initiates sign-in via:
   - First-party email/password
   - First-party magic-link (email verification token)
   - Google OIDC

2. Auth-core normalizes to `VerifiedIdentity`:
   ```typescript
   {
     provider: 'google' | 'local_password' | 'local_magic_link',
     provider_subject: string,  // Opaque IdP subject
     email: string,
     email_verified: boolean,
     name?: string,
     picture?: string,
     raw_claims: object
   }
   ```

3. Auth-core maps identity to `User` via `user_identities` table

4. For web dashboard OAuth flow:
   - Client: `web-dashboard` (public client, PKCE required)
   - Redirect to `/v1/oauth/authorize` with PKCE challenge
   - Server checks session cookie, redirects to `/login` if missing
   - On success, issues authorization code
   - Client exchanges code for tokens at `/v1/oauth/token`
   - Receives: access token (JWT), refresh token (HttpOnly cookie), session cookie

**AuthContext Structure:**

All downstream services see an `AuthContext` with:

```typescript
{
  principalType: 'anonymous' | 'user' | 'service',
  authTime: Date,
  sessionId?: string,          // For user sessions
  tokenId?: string,            // For PATs/API keys
  clientId?: string,           // OAuth client ID
  scopes: string[],            // Token-level permissions

  // User-specific (when principalType === 'user'):
  userId?: string,             // users.id
  workspaceId?: string,        // Selected workspace
  membershipId?: string,       // Membership in workspace
  roles?: string[],            // Workspace-level roles
  mfaLevel?: 'none' | 'mfa' | 'phishing_resistant',

  // Service-specific (when principalType === 'service'):
  serviceId?: string,          // service_identities.id
  serviceType?: 'internal' | 'external',
  allowedWorkspaces?: string[]
}
```

**Token Types:**

1. **Access Tokens (JWT):**
   - Short-lived: 10 minutes
   - Claims: `sub`, `iss`, `aud`, `exp`, `iat`, `sid`, `scp`
   - For users: `sub = users.id`
   - For services: `sub = service_identities.id`
   - Sent as: `Authorization: Bearer <token>`

2. **Refresh Tokens (Opaque):**
   - Long-lived: 30 days with 14-day idle timeout
   - Stored as hash envelopes (never plaintext)
   - Rotation on each use (new token issued, old revoked)
   - Reuse detection: v1 treats first reuse as benign race, logs low-severity event
   - Family tracking via `family_id` for future sophisticated reuse detection

3. **Personal Access Tokens (PATs):**
   - Format: `sbf_<tokenId>.<secret>` (opaque)
   - TTL: 30-90 days (no never-expiring keys)
   - Workspace-scoped or user-scoped
   - Stored as hash envelopes
   - Primary integration surface for external access
   - Available in v1/MVP

4. **Verification Tokens:**
   - For email verification, password reset, magic-link
   - Short-lived, one-time use
   - Stored in `verification_tokens` table

**Hash Envelope Pattern:**

All opaque tokens stored with:
```json
{
  "hash": "<HMAC-SHA256 output>",
  "salt": "<random per-token salt>",
  "key_id": "<KMS key identifier>",
  "hmac_algo": "HMAC-SHA256"
}
```

- Enables key rotation via `key_id`
- Tokens parsed to extract `tokenId` for DB lookup
- Secret validated against hash envelope
- Provider credentials (Plaid, Stripe) encrypted with KMS, not just hashed

### Multi-Tenancy & Workspace Isolation

**Workspaces** are the core unit of data isolation:

- Each workspace is a tenant boundary
- `workspace_memberships` links users to workspaces with roles
- Workspace selection via `X-Workspace-Id` header or default
- Future: RLS policies enforce `workspace_id = current_setting('app.workspace_id')::uuid`

**Postgres GUCs (Future):**
```sql
SET app.user_id = '<uuid>';
SET app.workspace_id = '<uuid>';
SET app.mfa_level = 'mfa';
SET app.service_id = '<uuid>';  -- For service principals
```

RLS policies will reference these GUCs for row-level isolation.

### Critical Data Models

**Auth Identity Separation:**
- `users` table: Core auth identity (id, primaryEmail, userState)
- `user_identities`: Links users to IdP identities (provider, provider_subject)
- `profiles` table: Application business data (userId, timezone, currency, settings)
- Middleware attaches both `userId` (auth) and `profileId` (business logic) to context

**OAuth 2.1 / OIDC Models:**
- `oauth_clients`: Registered clients (clientId, clientType, redirectUris, allowedGrantTypes)
- `oauth_authorization_codes`: One-time codes with PKCE challenge
- `auth_sessions`: User login sessions (mfaLevel, revokedAt)
- `refresh_tokens`: Opaque tokens with rotation and family tracking
- `api_keys`: Personal Access Tokens (PATs) with scopes

**Service Identities:**
- `service_identities`: Service principals (serviceType, allowedWorkspaces)
- `client_secrets`: OAuth client credentials stored as hash envelopes
- 1:1 relationship with `oauth_clients`

**Token Security:**
- All opaque tokens use canonical format: `<prefix>_<tokenId>.<secret>`
- Prefixes: `rt_` (refresh), `sbf_` (PAT), `ev_` (email verification)
- `tokenId` enables DB lookup, `secret` validated against hash envelope
- `last4` stored for UX (showing last 4 characters)

### Request Flow

1. **Request arrives** → `requestIdMiddleware` attaches correlation ID
2. **CORS middleware** → Handles cross-origin with credentials
3. **Auth context middleware** → Attaches `c.var.auth` (reserved for auth-core)
4. **Route-specific middleware** → Rate limiting, Zod validation
5. **Route handler (thin controller)** → Validates input, delegates to service
6. **Service layer** → Business logic, orchestrates repositories
7. **Repository layer** → Prisma queries, returns entities
8. **Service** → Maps entities to DTOs, throws domain errors if needed
9. **Route handler** → Maps domain errors to HTTP codes, returns JSON

### Single Responsibility Principle (SRP)

**Each function/class has ONE clear responsibility:**

- **Route handlers:** Parse request → Call service → Format response (< 30 lines)
- **Services:** Implement ONE business operation (e.g., `createToken`, `syncTransactions`)
- **Repositories:** Perform ONE database operation (`findById`, `create`, `update`, `delete`)
- **Utilities:** Perform ONE pure function (`hashToken`, `formatCurrency`, `validateEmail`)

**Keep functions focused and short:**
- Aim for functions under 50 lines (ideally 20-30)
- If a function does multiple things, extract helper functions
- Use early returns to reduce nesting
- Extract complex conditionals into named boolean helpers

### Testing Strategy

**Test Isolation:**
- API tests use `.env.test` with separate test database
- Run `pnpm db:reset-envtest` to reset test DB
- Use `vi.unmock('@repo/database')` in integration tests to avoid mock leakage

**Test Types:**
- **Unit Tests:** Colocated with source (`*.test.ts`), mock repositories
- **Integration Tests:** `apps/api/src/**/*.test.ts`, real database
- **E2E Tests:** `apps/web/e2e/`, Playwright with Chromium

**Current Status:** 234+ tests passing (unit + integration + E2E)

## Important Patterns & Conventions

### Route Handler Pattern (Thin Controller)
```typescript
// HTTP layer: validate input, delegate to service, map errors to HTTP
export const someRoute = new Hono<AppBindings>()
  .post('/', validator, async (c) => {
    const body = c.req.valid('json');
    const { userId } = c.var.auth;

    try {
      const result = await someService.doSomething({
        userId,
        ...body,
      });
      return c.json(result, 201);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return c.json({ error: 'Not found' }, 404);
      }
      if (error instanceof ValidationError) {
        return c.json({ error: error.message }, 400);
      }
      throw error; // 500
    }
  });
```

### Service Pattern (Business Logic)
```typescript
// Service: orchestrate business logic, validate rules, call repository
export class TokenService {
  constructor(
    private repository: TokenRepository,
    private auditLogger: AuditLogger
  ) {}

  async createToken(params: CreateTokenParams): Promise<Token> {
    // Business validation
    if (!this.isValidScope(params.scopes)) {
      throw new InvalidScopesError(params.scopes);
    }

    // Orchestrate repositories
    const token = await this.repository.create({
      userId: params.userId,
      scopes: params.scopes,
      expiresAt: this.calculateExpiry(),
    });

    // Emit domain events
    await this.auditLogger.log({
      type: 'token_created',
      userId: params.userId,
      tokenId: token.id,
    });

    return token;
  }
}
```

### Repository Pattern (Data Access)
```typescript
// Repository: pure data access, no business logic
export class TokenRepository {
  constructor(private db: PrismaClient) {}

  async create(data: CreateTokenData): Promise<ApiKey> {
    return this.db.apiKey.create({
      data: {
        id: data.id,
        userId: data.userId,
        keyHash: data.hashEnvelope,
        scopes: data.scopes,
        expiresAt: data.expiresAt,
      },
    });
  }

  async findById(id: string): Promise<ApiKey | null> {
    return this.db.apiKey.findUnique({
      where: { id },
    });
  }
}
```

### Domain Errors Pattern
```typescript
// Domain errors: represent business rule violations
export class TokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenError';
  }
}

export class DuplicateTokenNameError extends TokenError {
  constructor(name: string) {
    super(`Token name "${name}" already exists`);
    this.name = 'DuplicateTokenNameError';
  }
}

export class InvalidScopesError extends TokenError {
  constructor(scopes: string[]) {
    super(`Invalid scopes: ${scopes.join(', ')}`);
    this.name = 'InvalidScopesError';
  }
}
```

### Middleware Pattern
```typescript
// Auth middleware: validate credentials, attach context
export const authMiddleware = async (c: Context<AppBindings>, next: Next) => {
  const token = extractToken(c.req.header('Authorization'));
  const session = await validateToken(token);

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('auth', {
    userId: session.userId,
    profileId: session.profileId,
    scopes: session.scopes,
  });

  await next();
};
```

## Anti-Patterns (Red Flags in PRs)

- ❌ Inject `PrismaClient` directly into services → ✅ Always go through repositories
- ❌ Call repositories from route handlers → ✅ Routes → services → repositories
- ❌ Put business logic in repositories → ✅ Business rules live in services
- ❌ Return HTTP responses from services → ✅ Only HTTP layer knows about HTTP
- ❌ Map Prisma entities to DTOs in repositories → ✅ Services handle mapping
- ❌ Use `apps/web` imports in `packages/core` → ✅ Core is domain logic only
- ❌ Import `@repo/database` in `apps/web` → ✅ Web client uses API only

## Gotchas & Common Issues

### Database Schema Changes
After modifying `packages/database/schema.prisma`:
1. Run `pnpm db:generate` to regenerate Prisma client
2. Create migration: `cd packages/database && pnpm exec prisma migrate dev --name <name>`
3. Prisma client is cached - regenerate if schema changes not reflected

### Test Database Setup
- API tests require `.env.test` with `DATABASE_URL` pointing to test database
- OAuth flows require seeded client: `pnpm seed:local`
- Reset test DB if state is corrupted: `pnpm db:reset-envtest`

### OAuth Flow Testing
- Web dashboard client must be seeded: `pnpm db:seed-oauth`
- Redirect URI must match exactly: `http://localhost:5173/auth/callback`
- PKCE is required for all clients (even public)
- Session cookie must exist before hitting `/oauth/authorize`
- Authorization code is one-time use and expires quickly

### Rate Limiting
- Auth endpoints: 10 req/min per IP (configurable in Upstash)
- Graceful degradation: if Redis unavailable, requests succeed (fail-open)
- Separate rate limit buckets for different endpoint groups

### Turbo Caching
- Turbo caches build outputs, tests, and linting
- Clear cache if seeing stale results: `rm -rf .turbo node_modules/.cache`
- Force rebuild: `pnpm build --force`

### Token Storage Security
- Never log raw tokens or secrets
- Hash envelopes use HMAC-SHA256 with salt and key_id
- Provider credentials (Plaid, Stripe) encrypted with KMS, not just hashed
- Refresh token rotation: old token revoked when new one issued
- PAT format: `sbf_<tokenId>.<secret>` - only show secret once on creation

## Key File Locations

**API Entry & Routes:**
- `apps/api/src/index.ts` → `apps/api/src/app.ts`
- `apps/api/src/routes/v1/oauth/` - OAuth 2.1 endpoints
- `apps/api/src/routes/v1/auth/` - Auth endpoints (session, refresh, logout)
- `apps/api/src/routes/v1/tokens/` - PAT management endpoints

**Auth Core:**
- `packages/auth-core/src/service.ts` - Main auth service
- `packages/auth-core/src/token-service.ts` - Token generation & validation
- `packages/auth-core/src/oauth-clients.ts` - OAuth client management
- `packages/auth-core/src/pkce.ts` - PKCE challenge/verification

**Business Logic:**
- `apps/api/src/services/index.ts` - Service registry (DI container)
- `packages/core/src/tokens/` - Token domain (service + repository)
- `packages/core/src/profiles/` - Profile domain
- `packages/core/src/users/` - User domain

**Middleware:**
- `apps/api/src/middleware/auth-context.ts` - Attaches auth context
- `apps/api/src/middleware/pat.ts` - PAT authentication
- `apps/api/src/middleware/rate-limit/` - Rate limiting middleware

**Database:**
- `packages/database/schema.prisma` - Database schema
- `packages/database/migrations/` - Migration history

**Testing:**
- `apps/api/src/test/helpers.ts` - Test utilities
- `apps/api/src/test/setup.ts` - Test setup
- `apps/web/e2e/` - E2E tests

## Documentation References

- **Auth End-State:** `docs/auth-migration/end-auth-goal.md` - Complete auth architecture (source of truth)
- **OAuth MVP:** `docs/oauth-mvp.md` - Current OAuth 2.1 implementation
- **Auth Checklist:** `sectioned-auth-checklist.md` - Implementation tracking
- **Project Plan:** `.scope/project_plan.md` - Complete roadmap
- **Agent Steering:** `agent/steering/` - Architecture patterns and best practices
- **README:** `docs/README.md` - Setup guides and deployment

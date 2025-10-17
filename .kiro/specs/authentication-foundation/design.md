# Design Document

## Overview

The authentication foundation provides secure user authentication for SuperBasic Finance using Auth.js with a credentials provider. The design follows the API-first architecture where all authentication logic resides in the API server, with the web client acting as a thin consumer. JWT tokens are used for session management, enabling stateless authentication across requests.

**Scope Note**: This spec covers user session authentication for the web client using httpOnly cookies. Personal Access Tokens (PATs) for programmatic API access will be implemented in a separate spec (Phase 2: API Key Management) with Bearer token authentication, different endpoints (`/v1/tokens`), storage (hashed in database), and lifecycle management.

**Authentication Strategy**:
- **Web Client**: httpOnly cookies with CSRF protection (more secure, no XSS risk)
- **Programmatic Access**: Bearer tokens (PATs) for API builders (Phase 2)

## Architecture

### High-Level Flow

```
User → Web Client → API Server → @auth/core → PrismaAdapter → Database
                         ↓
                  Auth.js JWT Session
                         ↓
                  Protected Routes
```

### Components

1. **Auth.js Core Configuration** (`packages/auth`)
   - @auth/core setup with PrismaAdapter
   - Credentials provider for email/password
   - JWT strategy with Auth.js session management
   - Password hashing utilities (bcrypt)

2. **API Authentication Routes** (`apps/api/src/routes/v1`)
   - POST /v1/register - User registration
   - POST /v1/login - Login (sets httpOnly cookie, returns user)
   - POST /v1/logout - Logout (clears httpOnly cookie)
   - GET /v1/me - Get current user profile
   - ALL /v1/auth/* - Auth.js handlers (optional, for future OAuth)

3. **Authentication Middleware** (`apps/api/src/middleware/auth.ts`)
   - Extracts and validates Auth.js JWT session
   - Injects user context into request
   - Handles expired/invalid sessions

4. **Web Client Auth** (`apps/web/src/features/auth`)
   - Login page calling Auth.js signin
   - Registration page (custom endpoint)
   - Auth context provider
   - Protected route wrapper


## Components and Interfaces

### 1. Database Schema (Prisma)

Auth.js with PrismaAdapter requires specific tables. Update `packages/database/schema.prisma`:

```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  password      String?   // bcrypt hashed for credentials provider; null for OAuth users
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  accounts      Account[]
  sessions      Session[]
  
  @@map("users")
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([provider, providerAccountId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@map("sessions")
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  
  @@unique([identifier, token])
  @@map("verification_tokens")
}
```

**Email Normalization**: Emails are normalized to lowercase in application code before database operations to ensure case-insensitive uniqueness. The `@unique` constraint on the `email` field enforces uniqueness at the database level. For additional database-level enforcement in case-sensitive Postgres environments, consider adding a functional index: `CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));`

**Note on Schema Tables**:
- **Session table**: Created for Auth.js compatibility but not actively used with `strategy: "jwt"` (stateless sessions)
- **Account table**: Required for future OAuth providers (Phase 2+)
- **VerificationToken table**: Required for email verification (future enhancement)
- These tables enable future features without schema changes

### 2. Auth.js Core Configuration

Located in `packages/auth/src/config.ts`:

```typescript
import type { AuthConfig } from "@auth/core"
import Credentials from "@auth/core/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@repo/database"
import { verifyPassword } from "./password"
import { SESSION_MAX_AGE_SECONDS } from "./constants"

export const authConfig: AuthConfig = {
  basePath: "/v1/auth",
  adapter: PrismaAdapter(prisma), // For future OAuth; unused with JWT strategy
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }
        
        // Normalize email to lowercase
        const email = String(credentials.email).trim().toLowerCase()
        
        const user = await prisma.user.findUnique({
          where: { email }
        })
        
        if (!user || !user.password) {
          return null
        }
        
        const isValid = await verifyPassword(
          credentials.password as string,
          user.password
        )
        
        if (!isValid) {
          return null
        }
        
        return {
          id: user.id,
          email: user.email,
          name: user.name
        }
      }
    })
  ],
  session: {
    strategy: "jwt", // Stateless sessions; no database session rows created
    maxAge: SESSION_MAX_AGE_SECONDS
  },
  secret: process.env.AUTH_SECRET,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
      }
      return session
    }
  },
  pages: {
    signIn: "/login",
    error: "/login"
  }
}
```

**Note on PrismaAdapter with JWT Strategy**: The `PrismaAdapter` is included for future OAuth providers (Google, GitHub, etc.). With `strategy: "jwt"`, Auth.js uses stateless JWT tokens and does not create or read session rows from the database. The adapter tables (Session, Account, VerificationToken) are created in the schema but remain unused until OAuth is implemented in Phase 2+. This approach avoids schema migrations when adding OAuth later.

### 3. Authentication Constants

Located in `packages/auth/src/constants.ts`:

```typescript
// Session configuration - single source of truth
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60 // 30 days

// Cookie configuration
export const COOKIE_NAME = 
  process.env.NODE_ENV === "production" 
    ? "__Host-sbfin_auth"  // __Host- prefix enforces Secure, Path=/, no Domain
    : "__sbfin_auth"       // Dev-friendly (works with http://localhost)

// Password hashing
export const BCRYPT_SALT_ROUNDS = 10

// JWT configuration
export const JWT_SALT = "authjs.session-token" // Auth.js v5 default

// Clock skew tolerance for token validation
export const CLOCK_SKEW_TOLERANCE_SECONDS = 60
```

**Package Exports** (`packages/auth/src/index.ts`):

```typescript
// Re-export all public APIs for clean imports
export { authConfig } from "./config"
export { hashPassword, verifyPassword } from "./password"
export { authEvents } from "./events"
export {
  SESSION_MAX_AGE_SECONDS,
  COOKIE_NAME,
  BCRYPT_SALT_ROUNDS,
  JWT_SALT,
  CLOCK_SKEW_TOLERANCE_SECONDS
} from "./constants"

// Types
export type { AuthEvent, AuthEventType, AuthEventHandler } from "./events"
```

This allows clean imports like `import { verifyPassword, COOKIE_NAME } from "@repo/auth"` instead of deep imports.

### 4. Password Utilities

Located in `packages/auth/src/password.ts`:

```typescript
import bcrypt from "bcryptjs"
import { BCRYPT_SALT_ROUNDS } from "./constants"

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS)
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword)
}
```

### 5. Authentication Events

Located in `packages/auth/src/events.ts`:

```typescript
type AuthEventType = 
  | "user.registered"
  | "user.login.success"
  | "user.login.failed"
  | "user.logout"

interface AuthEvent {
  type: AuthEventType
  userId?: string
  email?: string
  ip?: string
  timestamp: Date
  metadata?: Record<string, unknown>
}

type AuthEventHandler = (event: AuthEvent) => void | Promise<void>

class AuthEventEmitter {
  private handlers: AuthEventHandler[] = []

  on(handler: AuthEventHandler) {
    this.handlers.push(handler)
  }

  async emit(event: Omit<AuthEvent, "timestamp">) {
    const fullEvent: AuthEvent = {
      ...event,
      timestamp: new Date()
    }

    // Fire and forget - don't block auth flow
    Promise.all(this.handlers.map(h => h(fullEvent))).catch(err => {
      console.error("Auth event handler error:", err)
    })
  }
}

export const authEvents = new AuthEventEmitter()
```

**Usage**: Emit events in auth routes for audit logging, analytics, or security monitoring. Handlers can write to database, send to observability service, or trigger alerts. Events are fire-and-forget to avoid blocking the authentication flow.

### 6. API Route Schemas

Using Zod for validation in `packages/types/src/auth.ts`:

```typescript
import { z } from "zod"

export const RegisterSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional()
})

export const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required")
})

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  createdAt: z.string()
})

export type RegisterInput = z.infer<typeof RegisterSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type User = z.infer<typeof UserSchema>
```


### 7. API Routes Implementation

**Login Route** (`apps/api/src/routes/v1/login.ts`):

```typescript
import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { LoginSchema } from "@repo/types"
import { verifyPassword, SESSION_MAX_AGE_SECONDS, JWT_SALT, COOKIE_NAME } from "@repo/auth"
import { prisma } from "@repo/database"
import { encode } from "@auth/core/jwt"
import { authConfig } from "@repo/auth"
import { setCookie } from "hono/cookie"

const loginRoute = new Hono()

loginRoute.post("/", zValidator("json", LoginSchema), async (c) => {
  const { email, password } = c.req.valid("json")
  
  // Normalize email to lowercase
  const normalizedEmail = email.toLowerCase().trim()
  
  // Find user
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (!user || !user.password) {
    return c.json({ error: "Invalid credentials" }, 401)
  }
  
  // Verify password
  const valid = await verifyPassword(password, user.password)
  if (!valid) {
    return c.json({ error: "Invalid credentials" }, 401)
  }
  
  // Generate JWT using Auth.js encode
  const token = await encode({
    token: {
      sub: user.id,
      id: user.id,
      email: user.email,
      iss: "sbfin",           // Issuer: prevents token reuse across systems
      aud: "sbfin:web"        // Audience: web client sessions only
    },
    secret: authConfig.secret!,
    salt: JWT_SALT,
    maxAge: SESSION_MAX_AGE_SECONDS
  })
  
  // Set httpOnly cookie (uses __Host- prefix in production for extra security)
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax", // Required for OAuth callbacks (future)
    maxAge: SESSION_MAX_AGE_SECONDS, // Matches JWT exp
    path: "/"
    // No Domain attribute = host-only (sent only to api.superbasicfinance.com)
    // Web client (app.superbasicfinance.com) uses credentials: "include" for cross-origin requests
    // CORS with credentials: true allows cookie to be sent despite different subdomains
  })
  
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString()
    }
  })
})

export { loginRoute }
```

**Logout Route** (`apps/api/src/routes/v1/logout.ts`):

```typescript
import { Hono } from "hono"
import { deleteCookie } from "hono/cookie"
import { COOKIE_NAME } from "@repo/auth"

const logoutRoute = new Hono()

logoutRoute.post("/", (c) => {
  deleteCookie(c, COOKIE_NAME, { path: "/" })
  return c.body(null, 204) // 204 No Content - successful with no response body
})

export { logoutRoute }
```

**Registration Route** (`apps/api/src/routes/v1/register.ts`):

```typescript
import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { RegisterSchema } from "@repo/types"
import { hashPassword } from "@repo/auth"
import { prisma } from "@repo/database"

const registerRoute = new Hono()

registerRoute.post("/", zValidator("json", RegisterSchema), async (c) => {
  const { email, password, name } = c.req.valid("json")
  
  // Normalize email to lowercase
  const normalizedEmail = email.toLowerCase().trim()
  
  // Check if user exists
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existing) {
    return c.json({ error: "Email already in use" }, 409) // 409 Conflict
  }
  
  // Hash password and create user
  const hashedPassword = await hashPassword(password)
  const user = await prisma.user.create({
    data: { email: normalizedEmail, password: hashedPassword, name },
    select: { id: true, email: true, name: true, createdAt: true }
  })
  
  return c.json({ user }, 201)
})

export { registerRoute }
```

**Note on Auto-Login**: Registration returns 201 with user data but does NOT set a session cookie. The web client should immediately call `/v1/login` with the same credentials to establish a session. This keeps endpoints focused and avoids duplicating login logic in the registration route.

**Session Route** (`apps/api/src/routes/v1/me.ts`):

```typescript
import { Hono } from "hono"
import { authMiddleware } from "../../middleware/auth"
import { prisma } from "@repo/database"

const meRoute = new Hono()

meRoute.get("/", authMiddleware, async (c) => {
  const userId = c.get("userId")
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, createdAt: true }
  })
  
  if (!user) {
    return c.json({ error: "User not found" }, 404)
  }
  
  return c.json({ user })
})

export { meRoute }
```

### 6. Authentication Middleware

Located in `apps/api/src/middleware/auth.ts`:

```typescript
import { Context, Next } from "hono"
import { getCookie } from "hono/cookie"
import { decode } from "@auth/core/jwt"
import { authConfig, JWT_SALT, CLOCK_SKEW_TOLERANCE_SECONDS, COOKIE_NAME } from "@repo/auth"

export async function authMiddleware(c: Context, next: Next) {
  try {
    // Check for httpOnly cookie (web client sessions only)
    const token = getCookie(c, COOKIE_NAME)
    
    if (!token) {
      return c.json({ error: "Unauthorized" }, 401)
    }
    
    // Note: Authorization header support intentionally omitted in v1
    // PATs will use a separate middleware in Phase 2 to prevent confusion
    // between session JWTs and API tokens
    
    // Verify JWT using Auth.js decode
    const decoded = await decode({
      token,
      secret: authConfig.secret!,
      salt: JWT_SALT,
    })
    
    if (!decoded || !decoded.id) {
      return c.json({ error: "Invalid or expired token" }, 401)
    }
    
    // Validate issuer and audience (defense-in-depth)
    if (decoded.iss !== "sbfin" || decoded.aud !== "sbfin:web") {
      return c.json({ error: "Invalid token claims" }, 401)
    }
    
    // Check expiration with clock skew tolerance
    const now = Math.floor(Date.now() / 1000)
    if (decoded.exp && now - CLOCK_SKEW_TOLERANCE_SECONDS > decoded.exp) {
      return c.json({ error: "Token expired" }, 401)
    }
    
    // Attach user context to request
    c.set("userId", decoded.id as string)
    c.set("userEmail", decoded.email as string)
    c.set("jti", decoded.jti as string) // For future token revocation
    
    await next()
  } catch (error) {
    return c.json({ error: "Unauthorized" }, 401)
  }
}
```

**Authentication Strategy**:
- **Session Auth (v1)**: httpOnly cookies only (more secure, no XSS risk)
- **PAT Auth (Phase 2)**: Separate middleware for Authorization: Bearer header to prevent confusion between session JWTs and API tokens
- **JWT Algorithm**: HS256 (Auth.js default with secret-based signing)
- **Clock Skew**: 60-second tolerance for token expiration checks
- **CSRF Protection**: SameSite=Lax cookie attribute provides basic CSRF protection

### 8. CORS Middleware

Located in `apps/api/src/middleware/cors.ts`:

```typescript
import { cors } from "hono/cors"

export const corsMiddleware = cors({
  origin: [
    "https://app.superbasicfinance.com",
    "https://*.vercel.app" // Preview deployments
  ],
  credentials: true, // Required for cookies
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400 // 24 hours
})

// Usage in main app:
// app.use("*", corsMiddleware)
```

**CORS Requirements**:
- `credentials: true` requires specific origins (not wildcard `*`)
- Server MUST set `Access-Control-Allow-Credentials: true` and specific `Access-Control-Allow-Origin` (Hono handles automatically)
- Server MUST include `Vary: Origin` header to prevent CDNs/browsers from caching responses with wrong origin headers (Hono handles automatically)
- Web client MUST use `fetch(url, { credentials: "include" })` to send cookies cross-origin

**How it works**: Host-only cookie on `api.superbasicfinance.com` is sent when web client at `app.superbasicfinance.com` makes requests with `credentials: "include"`. CORS with `credentials: true` allows the browser to send and accept cookies despite different subdomains.

### 9. Optional: Auth.js Handlers for Future OAuth

Located in `apps/api/src/routes/v1/auth.ts`:

```typescript
import { Hono } from "hono"
import { Auth } from "@auth/core"
import { authConfig } from "@repo/auth"

const authRoute = new Hono()

// Mount Auth.js handlers at /v1/auth/*
// For future OAuth providers (Google, GitHub, etc.)
// Handles: /signin, /signout, /session, /csrf, /providers, /callback
authRoute.all("/*", async (c) => {
  const request = c.req.raw
  const response = await Auth(request, authConfig)
  return response
})

export { authRoute }
```

**Note**: The `/v1/auth/*` handlers are optional for v1 since we're using programmatic login. They'll be useful when adding OAuth providers in the future.


## Data Models

### User Model

```typescript
interface User {
  id: string              // CUID
  email: string           // Unique, validated email
  password: string | null // bcrypt hashed for credentials; null for OAuth users; never exposed in API responses
  name: string | null     // Optional display name
  createdAt: Date         // Account creation timestamp
  updatedAt: Date         // Last update timestamp
}
```

### JWT Payload

Auth.js generates JWTs with the following structure:

```typescript
interface JWTPayload {
  sub: string         // Subject (user ID, Auth.js standard)
  id: string          // User ID (from our callback)
  email: string       // User email (from our callback)
  iss: string         // Issuer: "sbfin" (prevents cross-system token reuse)
  aud: string         // Audience: "sbfin:web" (web client sessions only)
  iat: number         // Issued at timestamp (Unix, Auth.js adds)
  exp: number         // Expiration timestamp (Unix, Auth.js adds)
  jti: string         // JWT ID for token tracking (Auth.js adds)
}
```

Note: Auth.js automatically adds `sub`, `iat`, `exp`, and `jti`. We add `id`, `email`, `iss`, and `aud` for security and token scoping.

### API Response Types

```typescript
// Registration response
interface RegisterResponse {
  user: {
    id: string
    email: string
    name: string | null
    createdAt: string
  }
}

// Login response (token set in httpOnly cookie, not returned in body)
interface LoginResponse {
  user: {
    id: string
    email: string
    name: string | null
    createdAt: string
  }
}

// Session response
interface SessionResponse {
  user: {
    id: string
    email: string
    name: string | null
    createdAt: string
  }
}

// Error response
interface ErrorResponse {
  error: string
  details?: Record<string, string[]> // Field-level validation errors
}
```

## Error Handling

### API Error Responses

1. **400 Bad Request** - Validation errors or business logic violations
   ```json
   {
     "error": "Validation failed",
     "details": {
       "email": ["Invalid email address"],
       "password": ["Password must be at least 8 characters"]
     }
   }
   ```

2. **401 Unauthorized** - Authentication failures
   ```json
   {
     "error": "Invalid credentials"
   }
   ```

3. **409 Conflict** - Resource conflicts (e.g., duplicate email on registration)
   ```json
   {
     "error": "Email already in use"
   }
   ```

4. **500 Internal Server Error** - Unexpected errors
   ```json
   {
     "error": "An unexpected error occurred"
   }
   ```

### Web Client Error Handling

- Display validation errors inline with form fields
- Show authentication errors in a toast or alert
- Redirect to login on 401 errors
- Log errors to observability service
- Provide user-friendly error messages

## Testing Strategy

### Unit Tests

1. **Password utilities** (`packages/auth`)
   - Test password hashing produces different hashes for same input
   - Test password verification with correct password
   - Test password verification with incorrect password

2. **Validation schemas** (`packages/types`)
   - Test valid inputs pass validation
   - Test invalid emails are rejected
   - Test short passwords are rejected

### Integration Tests

1. **Registration endpoint**
   - Test successful registration creates user
   - Test duplicate email returns 409
   - Test invalid data returns validation errors

2. **Login endpoint**
   - Test successful login returns user and sets httpOnly cookie
   - Test cookie attributes: httpOnly=true, SameSite=Lax, Secure=(true in production)
   - Test cookie name: `__Host-sbfin_auth` in production, `__sbfin_auth` in development
   - Test invalid credentials return 401
   - Test httpOnly cookie contains valid JWT with correct payload (including iss and aud claims)

3. **Session endpoint**
   - Test valid token returns user data
   - Test invalid token returns 401
   - Test expired token returns 401

4. **Auth middleware**
   - Test requests with valid token proceed
   - Test requests without token return 401
   - Test requests with invalid token return 401
   - Test requests with tampered token (modified JWT signature) return 401

### E2E Tests

1. **Registration flow**
   - User fills registration form
   - User submits form
   - User is redirected to dashboard
   - User sees their profile

2. **Login flow**
   - User fills login form
   - User submits form
   - User is redirected to dashboard
   - User sees their profile

3. **Protected route access**
   - Unauthenticated user is redirected to login
   - Authenticated user can access protected pages
   - User can log out and is redirected to login


## Web Client Architecture

### Auth Context Provider

Located in `apps/web/src/contexts/AuthContext.tsx`:

```typescript
interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name?: string) => Promise<void>
  logout: () => void
  isLoading: boolean
  isAuthenticated: boolean
}

// Provides authentication state and methods to entire app
// No token management needed (httpOnly cookies handled by browser)
// Fetches user profile on app initialization to check auth status
// register() calls /v1/register then immediately calls login() to establish session
// Calls logout endpoint to clear httpOnly cookie
// Handles 401 responses by redirecting to login
```

### Protected Route Component

Located in `apps/web/src/components/ProtectedRoute.tsx`:

```typescript
// Wraps routes that require authentication
// Redirects to /login if not authenticated
// Shows loading state while checking auth
```

### Login Page

Located in `apps/web/src/pages/Login.tsx`:

- Email and password input fields
- Form validation with inline errors
- Submit button with loading state
- Link to registration page
- Error message display for failed login

### Registration Page

Located in `apps/web/src/pages/Register.tsx`:

- Email, password, and password confirmation fields
- Form validation with inline errors
- Submit button with loading state
- Link to login page
- Error message display for failed registration

### API Client

Located in `apps/web/src/lib/api.ts`:

```typescript
// Fetch wrapper that:
// - Includes credentials: 'include' to send httpOnly cookies cross-origin
//   Example: fetch(url, { credentials: "include" })
// - Handles 401 responses by clearing auth state and redirecting
// - Provides typed methods for auth endpoints
// - No manual token management needed (cookies sent automatically by browser)
// Note: credentials: 'include' required because API subdomain ≠ same-origin
```

## Security Considerations

### Password Security

- Passwords hashed with bcrypt (cost factor 10)
- Never log or expose passwords in API responses
- Enforce minimum 8 character requirement
- Consider adding password strength requirements in future

### JWT Security

- Tokens signed with strong secret (minimum 32 characters)
- Secret stored in environment variables, never committed
- Tokens expire after 30 days
- No sensitive data in JWT payload (only ID and email)

### API Security

- Rate limiting on auth endpoints: 10 requests per minute per IP (implemented via Upstash Redis or in-memory sliding window)
  - Apply to `/v1/login`, `/v1/register` to prevent brute force attacks
  - Return 429 Too Many Requests when limit exceeded
- CORS configured with specific origins (not wildcard) and credentials support:
  - `origin: ["https://app.superbasicfinance.com", "https://*.vercel.app"]` for preview deployments
  - `credentials: true` to allow cookies
  - Server sets `Access-Control-Allow-Credentials: true` and specific `Access-Control-Allow-Origin` (never `*`)
- HTTPS enforced in production
- Audit logging for all authentication events:
  - Log user ID, event type (login, logout, registration), timestamp, IP address, success/failure
  - **Never log**: raw passwords, JWT tokens, or other sensitive credentials
  - Use structured logging with consistent event schema for security monitoring

### Web Client Security

- Tokens stored in **httpOnly cookies** (not accessible to JavaScript, prevents XSS attacks)
- **SameSite=Lax** cookie attribute provides CSRF protection for most requests (note: allows cookies on top-level navigation, so state-changing endpoints remain vulnerable to link-based CSRF attacks; explicit CSRF tokens recommended for future enhancement)
- **Secure flag** enabled in production (HTTPS only)
- Cookies automatically included in same-origin requests (no manual header management)
- XSS mitigation: httpOnly cookies + Content Security Policy (CSP) headers
- No sensitive data (passwords, tokens) accessible to client-side JavaScript
- Logout clears the httpOnly cookie via API endpoint
- Cookie persists across refreshes until expiration (30 days) or logout. In production, cookie name is `__Host-sbfin_auth` with Secure, Path=/, no Domain

## Compliance Summary

This section provides a quick reference for security audits and compliance reviews.

| Security Concern | Mitigation Strategy |
|------------------|---------------------|
| **Password brute-force** | Rate limiting (10 req/min per IP) on `/v1/login` and `/v1/register`; bcrypt cost factor 10 |
| **XSS attacks** | httpOnly cookies (not accessible to JavaScript); Content Security Policy headers |
| **CSRF attacks** | SameSite=Lax cookie attribute (v1); token-based CSRF validation planned (v1.1) |
| **Replay attacks** | JWT expiration (30 days); jti-based token revocation planned (future) |
| **Token theft** | httpOnly + Secure cookie flags; HTTPS enforced in production |
| **Token tampering** | HS256 JWT signature with secret-based verification |
| **Timing attacks** | Constant-time password comparison (bcrypt.compare) |
| **Privilege escalation** | Auth middleware attaches user context; route-level authorization checks |
| **Session fixation** | New JWT generated on each login; no session reuse |
| **Credential stuffing** | Email normalization; rate limiting; audit logging for anomaly detection |
| **Man-in-the-middle** | HTTPS enforced; Secure cookie flag in production |
| **Cookie tossing** | Host-only cookies (no Domain attribute); subdomain isolation |

**Compliance Notes**:
- GDPR: User data minimization (only ID, email in JWT); audit logging for access tracking
- SOC 2: Audit events emitted for all authentication actions; structured logging for monitoring
- OWASP Top 10: Addresses A01 (Broken Access Control), A02 (Cryptographic Failures), A07 (Identification and Authentication Failures)

## Environment Variables

### API Server (`apps/api/.env.local`)

```bash
AUTH_SECRET="your-secret-key-min-32-chars"
DATABASE_URL="postgresql://..."
```

### Web Client (`apps/web/.env.local`)

```bash
VITE_API_URL="http://localhost:3000"
```

## Dependencies to Add

### API Server
- `@auth/core` - For JWT encode/decode utilities
- `@hono/zod-validator` - Request validation
- `bcryptjs` - Password hashing
- `@types/bcryptjs` - TypeScript types

### Auth Package
- `@auth/core` - Auth.js JWT utilities and types (v5.x)
  - **Upgrade note**: When upgrading to Auth.js v6+, verify the JWT salt default (`authjs.session-token`) hasn't changed. The salt is defined in `JWT_SALT` constant for easy updates.
- `@auth/prisma-adapter` - Prisma adapter (for future OAuth)
- `bcryptjs` - Password utilities
- `@types/bcryptjs` - TypeScript types

### Web Client
- `@tanstack/react-query` - Already installed
- `react-hook-form` - Form management (optional, can use plain React)
- `zod` - Client-side validation (already in types package)

## Migration Path

1. Add User model to Prisma schema
2. Run migration to create users table
3. Implement auth utilities in packages/auth
4. Create API auth routes
5. Implement auth middleware
6. Build web client auth context
7. Create login and registration pages
8. Add protected route wrapper
9. Test end-to-end authentication flow

## Out of Scope (Future Specs)

- **Personal Access Tokens (PATs)**: Separate `/v1/tokens` resource for API builders with scopes, hashing, and long-lived credentials (Phase 2)
- **OAuth providers**: Google, GitHub via Auth.js providers
- **Two-factor authentication**: TOTP or SMS-based 2FA
- **Password reset flow**: Email-based password reset
- **Email verification**: Verify email addresses on registration

## Future Enhancements (This Spec)

- **CSRF tokens (v1.1)**: Implement double-submit token or signed anti-CSRF cookie + header for all state-changing routes (POST/PUT/PATCH/DELETE). Server sets `__sbfin_csrf` (non-httpOnly) + signs/derives a server-checked value. Client reads cookie → sends `X-CSRF-Token` header. Server validates token (and optionally origin/referer) before executing. This closes the SameSite=Lax "link click" loophole where cookies are sent on top-level navigation (e.g., malicious link to `/v1/logout`)
- **Token revocation**: Add `RevokedToken` table with `jti` and `expiresAt` for server-side logout
- **JWT rotation**: Rotate `jti` on sensitive events (password change, email change) to invalidate old tokens
- **Session management**: View and revoke active user sessions
- **Remember me option**: Extend cookie maxAge for longer sessions
- **Account deletion**: Soft delete with data retention policy
- **CSP headers**: Implement strict Content Security Policy headers

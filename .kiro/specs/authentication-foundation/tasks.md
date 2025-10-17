# Implementation Plan

- [x] 1. Database schema and migrations

  - [x] 1.1 Add User, Account, Session, and VerificationToken models to Prisma schema
    - Create User model with optional password field for OAuth compatibility
    - Add Auth.js required tables (Account, Session, VerificationToken)
    - Ensure email field has @unique constraint
    - _Requirements: 1.1, 1.2, 1.6_
  - [x] 1.2 Create and run Prisma migration
    - Generate migration for new auth tables
    - Apply migration to development database
    - _Requirements: 1.1_

- [x] 2. Authentication package setup

  - [x] 2.1 Create authentication constants
    - Define SESSION_MAX_AGE_SECONDS, COOKIE_NAME, JWT_SALT, BCRYPT_SALT_ROUNDS, CLOCK_SKEW_TOLERANCE_SECONDS
    - Implement environment-based cookie naming (\_\_Host- prefix in production)
    - _Requirements: 2.5, 3.1, 10.2_
  - [x] 2.2 Implement password utilities
    - Create hashPassword function using bcrypt with cost factor 10
    - Create verifyPassword function for constant-time comparison
    - _Requirements: 1.6, 10.1_
  - [x] 2.3 Create authentication event emitter
    - Define AuthEvent types (user.registered, user.login.success, user.login.failed, user.logout)
    - Implement fire-and-forget event emission for audit logging
    - _Requirements: 10.4_
  - [x] 2.4 Configure Auth.js with Prisma adapter
    - Set up Credentials provider with email/password
    - Configure JWT strategy with 30-day expiration
    - Implement email normalization in authorize function
    - Add JWT callbacks for custom claims (id, email, iss, aud)
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 3.1, 3.3_
  - [x] 2.5 Create package index with clean exports
    - Re-export all public APIs (config, utilities, constants, events)
    - Export TypeScript types for consumers
    - _Requirements: All_

- [x] 3. API validation schemas

  - [x] 3.1 Create Zod schemas for authentication
    - Define RegisterSchema with email, password (min 8 chars), optional name
    - Define LoginSchema with email and password
    - Define UserSchema for API responses
    - _Requirements: 1.4, 1.5, 2.6_

- [x] 4. API authentication routes

  - [x] 4.1 Implement registration endpoint (POST /v1/register)
    - Validate input with RegisterSchema
    - Normalize email to lowercase and trim
    - Check for existing user and return 409 if duplicate
    - Hash password and create user in database
    - Return 201 with user data (no session cookie)
    - Emit user.registered event
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  - [x] 4.2 Implement login endpoint (POST /v1/login)
    - Validate input with LoginSchema
    - Normalize email to lowercase and trim
    - Look up user and verify password
    - Generate JWT with iss="sbfin" and aud="sbfin:web" claims
    - Set httpOnly cookie with environment-appropriate name
    - Return user profile data
    - Emit user.login.success or user.login.failed event
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.2_
  - [x] 4.3 Implement logout endpoint (POST /v1/logout)
    - Delete httpOnly session cookie
    - Return 204 No Content
    - Emit user.logout event
    - _Requirements: 8.1_
  - [x] 4.4 Implement session endpoint (GET /v1/me)
    - Apply auth middleware
    - Fetch user from database using userId from context
    - Return user profile data
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 5. Authentication middleware

  - [x] 5.1 Create auth middleware for protected routes
    - Extract JWT from httpOnly cookie (no Authorization header support in v1)
    - Decode and verify JWT using Auth.js with JWT_SALT
    - Validate iss and aud claims
    - Check expiration with clock skew tolerance
    - Attach userId, userEmail, jti to request context
    - Return 401 for missing, invalid, or expired tokens
    - _Requirements: 3.3, 3.4, 4.1, 4.3, 4.4, 4.5_

- [x] 6. CORS middleware

  - [x] 6.1 Configure CORS for cross-origin cookie support
    - Set specific origins (app.superbasicfinance.com, \*.vercel.app)
    - Enable credentials: true
    - Verify Vary: Origin header is set automatically by Hono
    - _Requirements: 3.5, 10.3_

- [x] 7. Web client authentication context

  - [x] 7.1 Create AuthContext provider
    - Implement login function (calls /v1/login)
    - Implement register function (calls /v1/register then /v1/login)
    - Implement logout function (calls /v1/logout, clears state)
    - Check auth status on initialization (calls /v1/me)
    - Handle 401 responses by redirecting to login
    - _Requirements: 6.2, 6.3, 7.2, 7.3, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 9.4_
  - [x] 7.2 Create API client with credentials support
    - Configure fetch with credentials: "include" for cross-origin requests
    - Handle 401 responses globally
    - Provide typed methods for auth endpoints
    - _Requirements: 3.5, 9.1_

- [x] 8. Web client UI components

  - [x] 8.1 Create Login page
    - Build form with email and password fields
    - Add client-side validation
    - Display loading state during submission
    - Show error messages from API
    - Redirect to dashboard on success
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x] 8.2 Create Registration page
    - Build form with email, password, and password confirmation fields
    - Add client-side validation (password match, min length)
    - Display loading state during submission
    - Show field-level validation errors
    - Auto-login and redirect to dashboard on success
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [x] 8.3 Create ProtectedRoute component
    - Check authentication status
    - Redirect to login if unauthenticated
    - Show loading state while checking auth
    - _Requirements: 9.2, 9.3_

- [x] 9. Environment configuration

  - [x] 9.1 Set up environment variables
    - Add AUTH_SECRET to API .env (min 32 characters)
    - Add DATABASE_URL to API .env
    - Add VITE_API_URL to web client .env
    - Document required variables in .env.example files
    - _Requirements: 10.2_

- [x] 10. Integration and wiring
  - [x] 10.1 Wire auth routes into API server
    - Mount /v1/register, /v1/login, /v1/logout, /v1/me routes
    - Apply CORS middleware globally
    - Apply rate limiting to auth endpoints (10 req/min per IP)
    - _Requirements: 10.3_
  - [x] 10.2 Wire auth context into web client
    - Wrap app with AuthContext provider
    - Configure React Router with protected routes
    - Add login and registration pages to routing
    - _Requirements: 6.1, 7.1, 9.1_
  - [x] 10.3 Add audit logging handlers
    - Create event handler for authentication events
    - Log to structured logging service (user ID, event type, timestamp, IP, success/failure)
    - Never log passwords or JWT tokens
    - _Requirements: 10.4, 10.5_

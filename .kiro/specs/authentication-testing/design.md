# Design Document

## Overview

This document outlines the design for comprehensive testing of the authentication system. The testing strategy includes integration tests for API endpoints using Vitest and E2E tests for user flows using Playwright. The design ensures tests are isolated, repeatable, and can run both locally and in CI environments.

## Architecture

### Test Layers

```
┌─────────────────────────────────────────┐
│         E2E Tests (Playwright)          │
│  - Full user flows in browser           │
│  - Login → Dashboard → Logout            │
│  - Session persistence across refreshes  │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│    Integration Tests (Vitest + Hono)    │
│  - API endpoint testing                  │
│  - Database interactions                 │
│  - Authentication middleware             │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Test Infrastructure              │
│  - Test database setup/teardown          │
│  - HTTP client utilities                 │
│  - Mock rate limiter                     │
│  - Test data factories                   │
└─────────────────────────────────────────┘
```

### Test Database Strategy

- Use a separate test database (e.g., `superbasic_test`)
- Reset database state before each test using Prisma migrations
- Seed minimal test data as needed per test
- Clean up connections after test suite completes

### HTTP Testing Approach

- Use Hono's built-in testing utilities for integration tests
- Make requests directly to the Hono app instance (no network calls)
- Extract and reuse cookies for authenticated request sequences
- Mock external dependencies (Upstash Redis for rate limiting)

## Components and Interfaces

### 1. Test Setup Utilities (`apps/api/src/test/setup.ts`)

```typescript
/**
 * Global test setup and teardown
 */
export async function setupTestDatabase(): Promise<void>
export async function teardownTestDatabase(): Promise<void>
export async function resetDatabase(): Promise<void>
```

**Responsibilities:**
- Initialize test database connection
- Run migrations to create schema
- Provide database reset between tests
- Clean up connections on teardown

### 2. Test Helpers (`apps/api/src/test/helpers.ts`)

```typescript
/**
 * HTTP request helpers for testing
 */
export async function makeRequest(
  app: Hono,
  method: string,
  path: string,
  options?: RequestOptions
): Promise<Response>

export async function makeAuthenticatedRequest(
  app: Hono,
  method: string,
  path: string,
  sessionCookie: string,
  options?: RequestOptions
): Promise<Response>

export function extractCookie(response: Response, name: string): string | null

/**
 * Test data factories
 */
export function createTestUser(overrides?: Partial<User>): Promise<User>
export function createTestUserCredentials(): { email: string; password: string }
```

**Responsibilities:**
- Simplify making HTTP requests to Hono app
- Handle cookie extraction and injection
- Provide test data factories for common entities
- Abstract away boilerplate request setup

### 3. Rate Limit Mocking (`apps/api/src/test/mocks.ts`)

```typescript
/**
 * Mock rate limiter for testing
 */
export function mockRateLimiter(): void
export function restoreRateLimiter(): void
export function simulateRateLimitExceeded(): void
```

**Responsibilities:**
- Mock Upstash Redis client to avoid external dependencies
- Allow tests to simulate rate limit scenarios
- Restore real implementation after tests

### 4. Integration Test Suites

#### `apps/api/src/routes/v1/__tests__/register.test.ts`

Tests for POST /v1/register:
- Successful registration with valid data
- Duplicate email rejection (409)
- Invalid data validation (400)
- Password hashing verification
- Audit event emission

#### `apps/api/src/routes/v1/__tests__/login.test.ts`

Tests for POST /v1/login:
- Successful login with valid credentials
- Invalid password rejection (401)
- Non-existent user rejection (401)
- Session cookie creation
- Audit event emission (success and failure)

#### `apps/api/src/routes/v1/__tests__/me.test.ts`

Tests for GET /v1/me:
- Successful profile retrieval with valid session
- Unauthorized without session cookie (401)
- Unauthorized with invalid session cookie (401)
- Unauthorized with expired session cookie (401)

#### `apps/api/src/routes/v1/__tests__/logout.test.ts`

Tests for POST /v1/logout:
- Successful logout (204)
- Cookie deletion verification
- Audit event emission
- Session invalidation (subsequent requests fail)

#### `apps/api/src/middleware/__tests__/auth.test.ts`

Tests for authentication middleware:
- Valid JWT extraction and validation
- User context attachment (userId, userEmail, jti)
- Invalid token rejection
- Missing token rejection
- Expired token rejection
- Invalid claims rejection (iss, aud)

#### `apps/api/src/middleware/__tests__/rate-limit.test.ts`

Tests for rate limiting middleware:
- Request counting and limit enforcement
- 429 response when limit exceeded
- Rate limit headers in response
- Graceful failure when Redis unavailable
- Per-IP rate limiting

### 5. E2E Test Suites

#### `apps/web/e2e/auth.spec.ts`

Complete authentication flow tests:
- User registration flow (form → submit → redirect)
- User login flow (form → submit → dashboard)
- Session persistence (refresh page, still authenticated)
- Protected route access (redirect to login when unauthenticated)
- Logout flow (click logout → redirect to login)
- Full journey (register → login → dashboard → logout)

## Data Models

### Test User Factory

```typescript
interface TestUserCredentials {
  email: string;
  password: string; // Plaintext for testing
  name?: string;
}

interface TestUser {
  id: string;
  email: string;
  password: string; // Hashed in database
  name: string | null;
  createdAt: Date;
}
```

### Test Request Options

```typescript
interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}
```

## Error Handling

### Integration Tests

- Use `expect()` assertions from Vitest
- Verify HTTP status codes match expected values
- Verify error response bodies contain appropriate messages
- Verify database state after operations (e.g., user created, password hashed)

### E2E Tests

- Use Playwright's `expect()` for assertions
- Wait for navigation and element visibility
- Handle async operations with proper timeouts
- Take screenshots on failure for debugging

### Test Isolation

- Each test should be independent and not rely on other tests
- Reset database state before each test
- Clear cookies between E2E tests
- Mock external dependencies to avoid flakiness

## Testing Strategy

### Integration Tests

**Setup:**
1. Initialize test database connection
2. Run Prisma migrations to create schema
3. Mock rate limiter to avoid Redis dependency

**Per Test:**
1. Reset database to clean state
2. Create test data as needed
3. Execute test logic
4. Assert expected outcomes
5. Verify database state

**Teardown:**
1. Close database connections
2. Restore mocked dependencies

### E2E Tests

**Setup:**
1. Start API server on test port (e.g., 3001)
2. Start web client on test port (e.g., 5174)
3. Configure Playwright to use test URLs

**Per Test:**
1. Navigate to starting page
2. Interact with UI elements
3. Assert expected UI state
4. Verify navigation and redirects

**Teardown:**
1. Close browser contexts
2. Stop API and web servers

### Test Data Management

- Use factories to generate test data with sensible defaults
- Allow overrides for specific test scenarios
- Use unique emails per test to avoid conflicts (e.g., `test-${Date.now()}@example.com`)
- Clean up test data after each test

### CI Integration

- Run integration tests before E2E tests (faster feedback)
- Use separate test database in CI environment
- Set environment variables for test configuration
- Generate test reports and coverage metrics
- Fail build on test failures

## Performance Considerations

### Integration Tests

- Use in-memory database for faster tests (optional)
- Minimize database resets (only when necessary)
- Run tests in parallel where possible
- Mock slow external dependencies

### E2E Tests

- Run E2E tests in parallel with multiple workers
- Use headless browser mode in CI
- Reuse browser contexts where possible
- Skip E2E tests for non-UI changes (optional)

## Security Considerations

### Test Credentials

- Use fake credentials in tests (never real user data)
- Use consistent test passwords (e.g., "Test1234!")
- Ensure test database is isolated from production

### Test Environment

- Use separate environment variables for testing
- Never run tests against production database
- Use test-specific API keys and secrets
- Disable rate limiting in tests to avoid false failures

## Dependencies

### Integration Tests

- `vitest`: Test runner and assertion library
- `@hono/node-server`: For running Hono app in tests
- `@prisma/client`: Database access
- `@repo/auth`: Authentication utilities
- `@repo/types`: Zod schemas

### E2E Tests

- `@playwright/test`: Browser automation and testing
- Running API and web servers

### Development

- `tsx`: TypeScript execution for test setup scripts
- `dotenv-cli`: Environment variable management

## Configuration Files

### `apps/api/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test/**'],
    },
  },
});
```

### `apps/web/playwright.config.ts` (update)

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.TEST_WEB_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter=@repo/api dev',
      url: process.env.TEST_API_URL || 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: 'pnpm --filter=@repo/web dev',
      url: process.env.TEST_WEB_URL || 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
```

### `.env.test` (new file for test environment)

```
DATABASE_URL="postgresql://user:password@localhost:5432/superbasic_test"
NODE_ENV="test"
AUTH_SECRET="test-secret-key-for-testing-only"
UPSTASH_REDIS_REST_URL="mock://localhost"
UPSTASH_REDIS_REST_TOKEN="mock-token"
```

## Documentation

### README Updates

Add testing section to main README:

```markdown
## Testing

### Integration Tests

Run API integration tests:

```bash
pnpm --filter=@repo/api test
```

Run with coverage:

```bash
pnpm --filter=@repo/api test --coverage
```

### E2E Tests

Run end-to-end tests:

```bash
pnpm test:e2e
```

Run in UI mode for debugging:

```bash
pnpm --filter=@repo/web exec playwright test --ui
```

### Test Database Setup

Create test database:

```bash
createdb superbasic_test
```

Run migrations:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/superbasic_test" pnpm db:migrate
```
```

## Future Enhancements

- Add contract tests for OpenAPI spec validation
- Add performance tests for authentication endpoints
- Add security tests for common vulnerabilities (SQL injection, XSS)
- Add load tests for rate limiting behavior
- Add mutation testing to verify test quality

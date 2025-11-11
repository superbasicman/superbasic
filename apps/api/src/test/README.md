# API Integration Test Infrastructure

This directory contains the test infrastructure for API integration tests.

## Overview

The test infrastructure provides:

- **Database Setup**: Utilities for managing test database lifecycle
- **HTTP Helpers**: Functions for making requests to the Hono app
- **Mocks**: Mock implementations for external dependencies (rate limiters, etc.)
- **Global Setup**: Vitest configuration for running tests

## Quick Start

### 1. Create Test Database

The test database must have `_test` in its name for safety. You can either:

**Option A: Use a local Postgres instance**

```bash
createdb superbasic_test
```

**Option B: Create a test database on Neon**

1. Go to your Neon console
2. Create a new database named `neondb_test` in your project
3. Update `apps/api/.env.test` with the connection string

### 2. Update Environment Variables

Edit `apps/api/.env.test` and set your test database URL:

```bash
DATABASE_URL=postgresql://user:password@host:5432/database_test?sslmode=require
```

### 3. Run Migrations

```bash
cd apps/api
DATABASE_URL="your_test_database_url" pnpm prisma migrate deploy
```

Or use the database package:

```bash
pnpm --filter=@repo/database migrate
```

### Using the shared Neon dev branch

If you are working on the dev branch of the monorepo, the canonical connection string already lives in `packages/database/.env.local`. You can export it before running tests so every package (including `@repo/core`) talks to the same Neon branch:

```bash
set -a && source packages/database/.env.local && pnpm test --filter core -- --run
```

This is the recommended workflow now that pg-mem has been removed—tests use a real Postgres database, so make sure the referenced branch is disposable and resettable before running destructive suites.

If you need to drop the branch and reapply migrations before testing, run the helper script (it will prompt for confirmation, wipe `public`, deploy the baseline migration, then run the core suite):

```bash
pnpm run db:reset-and-test
```

Need to do the same against production? Create `packages/database/.env.prod` with the prod URL and pass `--prod`:

```bash
pnpm run db:reset-and-test --prod
```

Likewise, the core test helper can be pointed at prod with `pnpm run test:core:devdb --prod` (use sparingly).

### 4. Run Tests

```bash
# Run all tests
pnpm --filter=@repo/api test

# Run tests in watch mode
pnpm --filter=@repo/api test:watch

# Run tests with coverage
pnpm --filter=@repo/api test:coverage
```

## Test Structure

### Global Setup (`global-setup.ts`)

Runs once before all tests:
- Initializes test database connection
- Runs migrations to ensure schema is up to date
- Handles cleanup after all tests complete

### Database Utilities (`setup.ts`)

- `setupTestDatabase()`: Initialize database connection
- `resetDatabase()`: Clear all data between tests
- `teardownTestDatabase()`: Close connections after tests
- `getTestPrisma()`: Get Prisma client for tests

### HTTP Helpers (`helpers.ts`)

- `makeRequest()`: Make HTTP request to Hono app
- `makeAuthenticatedRequest()`: Make request with session cookie
- `extractCookie()`: Extract cookie from response headers
- `createTestUserCredentials()`: Generate unique test credentials
- `createTestUser()`: Create user in database with hashed password

### Mocks (`mocks.ts`)

- `mockRateLimiter()`: Disable rate limiting in tests
- `restoreRateLimiter()`: Restore real rate limiter
- `simulateRateLimitExceeded()`: Test rate limit behavior
- `mockEnv()`: Mock environment variables
- `createMockRedis()`: Create mock Redis client

## Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase, getTestPrisma } from './test/setup.js';
import { makeRequest, createTestUser } from './test/helpers.js';
import app from './app.js';

describe('My Feature', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('should do something', async () => {
    // Arrange
    const { user, credentials } = await createTestUser();
    
    // Act
    const response = await makeRequest(app, 'POST', '/v1/login', {
      body: {
        email: credentials.email,
        password: credentials.password,
      },
    });
    
    // Assert
    expect(response.status).toBe(200);
  });
});
```

### Testing Authenticated Endpoints

```typescript
it('should access protected route', async () => {
  // Create user and login
  const { credentials } = await createTestUser();
  const loginResponse = await makeRequest(app, 'POST', '/v1/login', {
    body: credentials,
  });
  
  // Extract session cookie
  const sessionCookie = extractCookie(loginResponse, 'authjs.session-token');
  
  // Make authenticated request
  const response = await makeAuthenticatedRequest(
    app,
    'GET',
    '/v1/me',
    sessionCookie!
  );
  
  expect(response.status).toBe(200);
});
```

### Testing Rate Limiting

```typescript
import { simulateRateLimitExceeded, restoreRateLimiter } from './test/mocks.js';

it('should return 429 when rate limited', async () => {
  simulateRateLimitExceeded();
  
  const response = await makeRequest(app, 'POST', '/v1/login', {
    body: { email: 'test@example.com', password: 'password' },
  });
  
  expect(response.status).toBe(429);
  
  restoreRateLimiter();
});
```

## Best Practices

1. **Always reset database**: Use `beforeEach(async () => await resetDatabase())` to ensure test isolation
2. **Use unique emails**: `createTestUserCredentials()` generates unique emails automatically
3. **Test real behavior**: Avoid mocking unless testing external dependencies
4. **Keep tests focused**: One assertion per test when possible
5. **Clean up**: The global teardown handles cleanup, but be mindful of resources

## Troubleshooting

### "Test database not initialized"

Make sure your test database exists and is accessible. Check:
- Database URL in `.env.test` contains `_test`
- Database server is running
- Migrations have been applied

### "Rate limiter errors"

Rate limiting is disabled in tests by default (no Redis URL in `.env.test`). If you see rate limiter errors:
- Check that `UPSTASH_REDIS_REST_URL` is not set in `.env.test`
- Or use `mockRateLimiter()` in your test

### "Prisma client not generated"

Run:
```bash
pnpm --filter=@repo/database generate
```

### Tests are slow

- Tests run sequentially by default to avoid database conflicts
- Consider using transactions for faster cleanup (future enhancement)
- Mock external API calls (Stripe, Plaid, etc.)

## Configuration

### Vitest Config (`vitest.config.ts`)

- **globals**: Enable global test APIs (describe, it, expect)
- **environment**: Node.js environment
- **globalSetup**: Run database setup before all tests
- **pool**: Use forks with single fork for sequential execution
- **coverage**: V8 coverage provider with HTML reports

### Environment Variables (`.env.test`)

- `NODE_ENV=test`: Set environment to test
- `DATABASE_URL`: Test database connection string (must contain `_test`)
- `AUTH_SECRET`: Test-only secret for JWT signing
- `UPSTASH_REDIS_REST_URL`: Leave empty to disable rate limiting

## Future Enhancements

- [ ] Use database transactions for faster test isolation
- [ ] Add test data factories for common entities
- [ ] Add snapshot testing for API responses
- [ ] Add contract testing for OpenAPI spec
- [ ] Add performance benchmarks

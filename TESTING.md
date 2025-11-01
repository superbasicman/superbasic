# Testing Guide

## Running Tests

### Prerequisites

Tests require environment variables to be configured. There are two ways to set them up:

#### Option 1: Create `.env.test` file (Recommended)

Create `apps/api/.env.test` with your test database credentials:

```bash
# Copy the example file
cp apps/api/.env.test.example apps/api/.env.test

# Edit with your actual credentials
# Required variables:
# - DATABASE_URL: Your test database connection string (Neon branch recommended)
# - AUTH_SECRET: Any 32+ character string for testing
# - UPSTASH_REDIS_REST_URL: Your Upstash Redis URL (optional, tests will skip rate limiting if not set)
# - UPSTASH_REDIS_REST_TOKEN: Your Upstash Redis token (optional)
```

#### Option 2: Use Gitpod Environment Variables

If you added environment variables to your Gitpod project settings, they should be available in the environment. However, the test runner specifically looks for a `.env.test` file, so you'll need to create one from the environment variables:

```bash
# Create .env.test from environment variables
cat > apps/api/.env.test << EOF
PORT=3000
NODE_ENV=test
DATABASE_URL=${DATABASE_URL}
AUTH_SECRET=${AUTH_SECRET}
AUTH_URL=http://localhost:3000
AUTH_TRUST_HOST=true
UPSTASH_REDIS_REST_URL=${UPSTASH_REDIS_REST_URL}
UPSTASH_REDIS_REST_TOKEN=${UPSTASH_REDIS_REST_TOKEN}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
EMAIL_SERVER=${EMAIL_SERVER}
EMAIL_FROM=${EMAIL_FROM}
RESEND_API_KEY=${RESEND_API_KEY}
VITEST_MOCK_DATABASE=false
EOF
```

### Running Tests

Once `.env.test` is configured:

```bash
# Run all API tests
cd apps/api
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage

# Run core package tests
cd packages/core
pnpm test

# Run all tests from root
pnpm test
```

### Test Database Requirements

The test database must be:
1. A separate database from your development database
2. Either:
   - Contains `_test` in the database name, OR
   - Is a Neon branch database (URL contains `/neondb?`), OR
   - `NODE_ENV=test` is set

This safety check prevents accidentally running tests against your production or development database.

### Troubleshooting

**Error: "DATABASE_URL not set, skipping database setup"**
- The `.env.test` file is missing or doesn't contain `DATABASE_URL`
- Create the file as described above

**Error: "Test database not initialized"**
- The `DATABASE_URL` is set but the database connection failed
- Check that your database is accessible
- Verify the connection string is correct
- Ensure the database exists

**Error: "DATABASE_URL must point to a test database"**
- Your database URL doesn't meet the safety requirements
- Use a Neon branch database, or
- Add `_test` to your database name, or
- Ensure `NODE_ENV=test` is set

**Tests hang or timeout**
- Check that your database is accessible
- Verify Redis credentials if using rate limiting tests
- Try running tests with `--no-coverage` flag

### Test Structure

```
apps/api/src/
  routes/v1/
    __tests__/          # Integration tests (full stack)
  middleware/
    __tests__/          # Middleware tests

packages/core/src/
  domain/
    __tests__/
      domain-service.test.ts      # Unit tests (mocked dependencies)
      domain-repository.test.ts   # Integration tests (test database)
```

### CI/CD

In CI environments, set environment variables as secrets:
- `DATABASE_URL` - Test database connection string
- `AUTH_SECRET` - Test auth secret
- `UPSTASH_REDIS_REST_URL` - Redis URL (optional)
- `UPSTASH_REDIS_REST_TOKEN` - Redis token (optional)

The test runner will automatically use these if `.env.test` doesn't exist.

# E2E Testing Guide

## Running E2E Tests

The E2E tests require both the API and web servers to be running. Choose the method that works best for you:

### Option 1: One Command (Recommended)

Use the provided script that handles server startup and cleanup automatically:

```bash
# From workspace root - runs all E2E tests
pnpm --filter=@repo/web test:e2e:run

# Run specific test file
pnpm --filter=@repo/web test:e2e:run auth.spec.ts

# Run with grep filter
pnpm --filter=@repo/web test:e2e:run -- -g "registration"

# Run with UI mode
pnpm --filter=@repo/web test:e2e:run -- --ui
```

This script will:

- Start the API server with test database
- Start the web dev server
- Wait for both to be ready
- Run your tests
- Clean up servers automatically when done

### Option 2: Manual Server Control (Best for Development)

For faster test iterations during development, start the servers manually in separate terminals:

```bash
# Terminal 1: Start API server with test database
pnpm --filter=@repo/api dev:test

# Terminal 2: Start web dev server
pnpm --filter=@repo/web dev

# Terminal 3: Run tests (servers will be reused)
pnpm --filter=@repo/web test:e2e
```

With `reuseExistingServer: true` in the Playwright config, tests will connect to your running servers instead of starting new ones. This is much faster for iterative development.

## Test Database

E2E tests use a separate test database configured in `apps/api/.env.test`. This ensures:

- Tests don't interfere with development data
- Each test run starts with a clean state
- Safe to run tests in parallel

## Authentication Test Suite

The `auth.spec.ts` file contains comprehensive tests for:

- **Registration Flow** (Requirements 6.1, 6.2)
  - Form validation
  - Successful registration
  - Duplicate email handling
- **Login Flow** (Requirements 6.3, 6.4)

  - Valid credentials
  - Invalid credentials
  - User information display

- **Session Persistence** (Requirement 6.6)

  - Page refresh
  - Navigation
  - Multiple page loads

- **Logout Flow** (Requirements 6.5, 6.7)

  - Session clearing
  - Protected route access after logout

- **Complete Journey** (All Requirements)
  - Full authentication cycle
  - Data persistence
  - Multiple login/logout cycles

## Troubleshooting

### Servers Won't Start

If Playwright times out waiting for servers:

1. Check that ports 3000 and 5173 are available:

   ```bash
   lsof -ti:3000 -ti:5173
   ```

2. Try starting servers manually to see error messages

3. Verify test database connection in `apps/api/.env.test`

### Tests Fail Intermittently

- Increase timeout in `playwright.config.ts` if servers are slow to start
- Use `reuseExistingServer: true` and start servers manually
- Check that test database is accessible

### Dependency Optimization

Vite may show "Re-optimizing dependencies" on first run. This is normal and only happens once per dependency change.

## Writing New E2E Tests

Use the helper functions in `e2e/helpers.ts`:

```typescript
import { test } from "@playwright/test";
import {
  registerUser,
  loginUser,
  logoutUser,
  generateTestUser,
} from "./helpers";

test("my new test", async ({ page }) => {
  const user = generateTestUser();
  await registerUser(page, user);
  // Your test logic here
});
```

These helpers handle common authentication flows and ensure tests are isolated with unique user data.

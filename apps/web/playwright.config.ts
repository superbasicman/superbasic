import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve workspace root (two levels up from apps/web)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '../..');

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
  // Only start servers automatically if E2E_MANUAL_SERVERS is not set
  // This allows the run-e2e.sh script to manage servers itself
  webServer: process.env.E2E_MANUAL_SERVERS
    ? undefined
    : [
        {
          command: 'pnpm --filter=@repo/api dev:test',
          url: process.env.TEST_API_URL || 'http://localhost:3000',
          reuseExistingServer: !process.env.CI,
          timeout: 120000,
          cwd: workspaceRoot,
        },
        {
          command: 'pnpm --filter=@repo/web dev',
          url: process.env.TEST_WEB_URL || 'http://localhost:5173',
          reuseExistingServer: !process.env.CI,
          timeout: 120000,
          cwd: workspaceRoot,
        },
      ],
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: ['./src/test/global-setup.ts'],
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    // Integration tests talk to real Postgres/Redis and can occasionally run slow
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test/**'],
    },
    // Run tests sequentially to avoid database conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Suppress expected error logs to keep CI output clean
    onConsoleLog(log: string): false | void {
      // Suppress Prisma initialization errors in unit tests
      if (log.includes('PrismaClientInitializationError')) {
        return false;
      }

      // Suppress expected auth errors during testing
      // These are intentional test cases (invalid credentials, missing fields, etc.)
      if (
        log.includes('[auth][error]') ||
        log.includes('CredentialsSignin') ||
        log.includes('MissingCSRF') ||
        log.includes('CallbackRouteError')
      ) {
        return false;
      }
    },
  },
  resolve: {
    alias: {
      '@prisma/client': '@prisma/client',
    },
  },
});

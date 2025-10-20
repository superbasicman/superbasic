import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: ['./src/test/global-setup.ts'],
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
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
    // Suppress unhandled rejection warnings for Prisma initialization errors in unit tests
    onConsoleLog(log: string): false | void {
      if (log.includes('PrismaClientInitializationError')) {
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

import { defineConfig } from 'vitest/config';

process.env.TOKEN_HASH_KEYS ??= '{"v1":"test_token_hash_secret_for_vitest"}';
process.env.TOKEN_HASH_ACTIVE_KEY_ID ??= 'v1';
process.env.AUTH_SECRET ??=
  'test_auth_secret_value_that_is_long_enough_12345678901234567890';
process.env.AUTH_JWT_PRIVATE_KEY ??=
  `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIB0Kj7QDs1uGLV7msYDXS4wxLBzME2YkdE+5EYXPLkZX
-----END PRIVATE KEY-----`;
process.env.AUTH_JWT_KEY_ID ??= 'test-access-key';

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
    // Suppress expected error logs to keep CI output clean
    onConsoleLog(log: string): false | void {
      // Suppress Prisma initialization errors in unit tests
      if (log.includes('PrismaClientInitializationError')) {
        return false;
      }
      
      // Suppress expected Auth.js errors during testing
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

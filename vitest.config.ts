import { defineConfig } from 'vitest/config';

process.env.TOKEN_HASH_KEYS ??= '{"v1":"test_token_hash_secret_for_vitest"}';
process.env.TOKEN_HASH_ACTIVE_KEY_ID ??= 'v1';
process.env.AUTH_SECRET ??=
  'test_auth_secret_value_that_is_long_enough_12345678901234567890';
process.env.AUTH_JWT_PRIVATE_KEY ??=
  `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIB0Kj7QDs1uGLV7msYDXS4wxLBzME2YkdE+5EYXPLkZX
-----END PRIVATE KEY-----`;

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'e2e/',
        '**/*.config.{js,ts}',
        '**/*.d.ts',
        '**/index.ts',
      ],
    },
  },
});

import { defineConfig } from 'vitest/config';

process.env.TOKEN_HASH_KEYS ??= '{"v1":"test_token_hash_secret_for_vitest"}';
process.env.TOKEN_HASH_ACTIVE_KEY_ID ??= 'v1';

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

import { defineConfig } from 'vitest/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnvFile(relativePath: string) {
  try {
    const envPath = resolve(__dirname, relativePath);
    const envContent = readFileSync(envPath, 'utf-8');

    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match && match[1] && match[2] !== undefined) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  } catch (error) {
    // Silently ignore missing env files
  }
}

// Prefer developer-local configuration when available
loadEnvFile('../database/.env.local');
// Fall back to shared test configuration (e.g. CI) if local file missing
loadEnvFile('../database/.env.test');

// Provide a deterministic, high-entropy secret for tests when none set
process.env.AUTH_SECRET ??= 'test_auth_secret_for_vitest_1234567890';
process.env.TOKEN_HASH_KEYS ??= '{"v1":"test_token_hash_secret_for_vitest"}';
process.env.TOKEN_HASH_ACTIVE_KEY_ID ??= 'v1';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});

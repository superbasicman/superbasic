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

// Prefer test environment configuration when running vitest
loadEnvFile('../database/.env.test');
// Fallback to local configuration if test config not present
loadEnvFile('../database/.env.local');

// Provide a deterministic, high-entropy secret for tests when none set
process.env.AUTH_SECRET ??= 'test_auth_secret_for_vitest_1234567890';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});

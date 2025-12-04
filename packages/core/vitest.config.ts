import { defineConfig } from 'vitest/config';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const envContent = readFileSync(filePath, 'utf-8');

  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match && match[1] && match[2] !== undefined) {
      const key = match[1].trim();
      const rawValue = match[2].trim();
      const value =
        (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
        (rawValue.startsWith("'") && rawValue.endsWith("'"))
          ? rawValue.slice(1, -1)
          : rawValue;
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const workspaceRoot = resolve(__dirname, '..', '..');
// Load .env.test files FIRST so they take precedence over .env.local
const candidateEnvFiles = [
  resolve(workspaceRoot, 'apps/api/.env.test'),
  resolve(workspaceRoot, '.env.test'),
  resolve(workspaceRoot, 'packages/database/.env.test'),
  resolve(__dirname, '.env.test'),
  resolve(workspaceRoot, '.env.local'),
  resolve(workspaceRoot, 'apps/api/.env.local'),
  resolve(workspaceRoot, 'packages/database/.env.local'),
  resolve(__dirname, '.env.local'),
];

candidateEnvFiles.forEach(loadEnvFile);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});

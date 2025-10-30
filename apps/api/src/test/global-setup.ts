/**
 * Vitest global setup
 * Runs once before all tests
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { setupTestDatabase, teardownTestDatabase } from './setup.js';

export async function setup() {
  // Load .env.test file if it exists
  // This ensures environment variables are available when running tests directly with vitest
  // We manually parse the file instead of using dotenv to avoid Vite resolution issues
  try {
    const envPath = resolve(process.cwd(), '.env.test');
    const envContent = readFileSync(envPath, 'utf-8');
    
    // Parse .env file format (simple key=value pairs)
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) return;
      
      // Parse KEY=VALUE format
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match && match[1] && match[2] !== undefined) {
        const key = match[1].trim();
        const value = match[2].trim();
        // Only set if not already defined (respect existing env vars)
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  } catch (error) {
    // Silently fail if .env.test doesn't exist
    // Tests will use existing environment variables
  }
  
  await setupTestDatabase();
}

export async function teardown() {
  await teardownTestDatabase();
}

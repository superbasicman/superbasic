/**
 * Vitest global setup
 * Runs once before all tests
 */

import { setupTestDatabase, teardownTestDatabase } from './setup.js';

export async function setup() {
  await setupTestDatabase();
}

export async function teardown() {
  await teardownTestDatabase();
}

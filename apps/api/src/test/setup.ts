/**
 * Global test setup and teardown utilities
 * Manages test database lifecycle for integration tests
 */

import { PrismaClient } from '@repo/database';

// Separate Prisma client for tests to avoid singleton conflicts
let testPrisma: PrismaClient | null = null;

/**
 * Initialize test database connection
 * Called once before all tests run
 */
export async function setupTestDatabase(): Promise<void> {
  // Ensure we're using the test database
  // For Neon, check for different branch endpoint or "_test" in database name
  const dbUrl = process.env.DATABASE_URL || '';
  const isTestDb = dbUrl.includes('_test') || dbUrl.includes('ep-calm-truth'); // Neon test branch endpoint

  if (!isTestDb) {
    throw new Error(
      'DATABASE_URL must point to a test database (should contain "_test" or use a dedicated test branch)'
    );
  }

  if (!testPrisma) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required for tests');
    }

    testPrisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });

    // Connect to database
    await testPrisma.$connect();
  }

  // Note: Migrations should be run manually before tests or in CI
  // Run: DATABASE_URL="..." pnpm --filter=@repo/database exec prisma migrate deploy
}

/**
 * Reset database to clean state
 * Called before each test to ensure isolation
 */
export async function resetDatabase(): Promise<void> {
  // Initialize if not already done (for tests that don't use global setup)
  if (!testPrisma) {
    await setupTestDatabase();
  }

  if (!testPrisma) {
    throw new Error('Test database not initialized. Call setupTestDatabase first.');
  }

  // Delete all data in reverse order of foreign key dependencies
  // This ensures referential integrity is maintained during cleanup
  
  // Delete profiles first (child of users)
  await testPrisma.profile.deleteMany();
  
  // Then delete users
  await testPrisma.user.deleteMany();

  // Add other tables here as they're created
  // Order matters: delete child tables before parent tables
}

/**
 * Clean up test database connections
 * Called once after all tests complete
 */
export async function teardownTestDatabase(): Promise<void> {
  if (testPrisma) {
    await testPrisma.$disconnect();
    testPrisma = null;
  }
}

/**
 * Get the test Prisma client instance
 * Use this in tests instead of the global singleton
 */
export function getTestPrisma(): PrismaClient {
  if (!testPrisma) {
    throw new Error('Test database not initialized. Call setupTestDatabase first.');
  }
  return testPrisma;
}

// Vitest global setup hooks
export async function setup() {
  await setupTestDatabase();
}

export async function teardown() {
  await teardownTestDatabase();
}

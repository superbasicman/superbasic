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
  // Skip database setup if DATABASE_URL is not provided (for unit tests that don't need DB)
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('DATABASE_URL not set, skipping database setup (unit tests only)');
    return;
  }

  // Ensure we're using the test database
  // For Neon, check for different branch endpoint or "_test" in database name
  const dbUrl = databaseUrl;
  const isTestDb = dbUrl.includes('_test') || dbUrl.includes('ep-calm-truth') || process.env.NODE_ENV === 'test'; // Neon test branch endpoint

  if (!isTestDb) {
    throw new Error(
      'DATABASE_URL must point to a test database (should contain "_test" or use a dedicated test branch)'
    );
  }

  if (!testPrisma) {
    try {
      testPrisma = new PrismaClient({
        datasources: {
          db: {
            url: databaseUrl,
          },
        },
      });

      // Connect to database
      await testPrisma.$connect();
    } catch (error) {
      console.warn('Failed to initialize Prisma Client for tests:', error);
      // Don't throw - allow unit tests to run without database
      testPrisma = null;
    }
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
  
  // Delete API keys first (child of users and profiles)
  await testPrisma.apiKey.deleteMany();
  
  // Delete profiles (child of users)
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

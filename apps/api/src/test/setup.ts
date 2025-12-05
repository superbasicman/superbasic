/**
 * Global test setup and teardown utilities
 * Manages test database lifecycle for integration tests
 */

import { PrismaClient } from '@repo/database';
import { Redis } from '@repo/rate-limit';

// Separate Prisma client for tests to avoid singleton conflicts
let testPrisma: PrismaClient | null = null;

// Redis client for test cleanup
let testRedis: Redis | null = null;

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
  // Accept: "_test" in database name, Neon branch URLs, or NODE_ENV=test
  const dbUrl = databaseUrl;
  const isTestDb =
    dbUrl.includes('_test') || // Database name contains "_test"
    dbUrl.includes('/neondb?') || // Neon branch database (not main)
    process.env.NODE_ENV === 'test'; // Test environment

  if (!isTestDb) {
    throw new Error(
      'DATABASE_URL must point to a test database (should contain "_test", use a Neon branch, or set NODE_ENV=test)'
    );
  }

  if (!testPrisma) {
    testPrisma = await createPrismaClientWithRetry(databaseUrl);
  }

  // Initialize Redis client for test cleanup
  if (!testRedis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      testRedis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
    } catch (error) {
      console.warn('Failed to initialize Redis client for tests:', error);
      testRedis = null;
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

  await testPrisma.oAuthAuthorizationCode.deleteMany();
  await testPrisma.clientSecret.deleteMany();
  await testPrisma.serviceIdentity.deleteMany();
  await testPrisma.oAuthClient.deleteMany();
  // Delete API keys first (child of users and profiles)
  await testPrisma.apiKey.deleteMany();
  await testPrisma.refreshToken.deleteMany();
  // Delete sessions before users to avoid orphaned records
  await testPrisma.authSession.deleteMany();
  // Clean up workspace-related tables before removing profiles
  await testPrisma.workspaceMember.deleteMany();
  await testPrisma.workspace.deleteMany();
  // Delete profiles (child of users)
  await testPrisma.profile.deleteMany();
  // Then delete users (parents)
  await testPrisma.user.deleteMany();

  // Add other tables here as they're created
  // Order matters: delete child tables before parent tables
}

/**
 * Reset specific Redis rate limit key
 * Called before rate limit tests to ensure clean state
 *
 * @param key - The rate limit key to reset (e.g., 'magic-link:test@example.com')
 */
export async function resetRedisKey(key: string): Promise<void> {
  // Initialize if not already done
  if (!testRedis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    testRedis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }

  if (!testRedis) {
    return; // Silently skip if Redis not available
  }

  try {
    // Delete the specific rate limit key
    await testRedis.del(`ratelimit:${key}`);
  } catch (error) {
    // Silently fail - don't block tests
  }
}

/**
 * Reset all Redis rate limit keys (use sparingly)
 * This is a simpler approach that just deletes known test keys
 */
export async function resetRedis(): Promise<void> {
  // Initialize if not already done
  if (!testRedis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    testRedis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }

  if (!testRedis) {
    return; // Silently skip if Redis not available
  }

  try {
    // Delete common test rate limit keys
    // This is faster than scanning and sufficient for tests
    const testKeys = [
      'ratelimit:magic-link:test@example.com',
      'ratelimit:magic-link:ratelimit@example.com',
      'ratelimit:magic-link:ratelimit2@example.com',
      'ratelimit:magic-link:ratelimit3@example.com',
      'ratelimit:magic-link:ratelimit4@example.com',
      'ratelimit:magic-link:normalize@example.com',
      'ratelimit:magic-link:unique@example.com',
      'ratelimit:magic-link:expiry@example.com',
      'ratelimit:magic-link:hashed@example.com',
      'ratelimit:magic-link:token-test@example.com',
    ];

    // Delete keys (Redis del command accepts multiple keys)
    await testRedis.del(...testKeys);
  } catch (error) {
    // Silently fail - don't block tests
  }
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

  // Clean up Redis connection
  testRedis = null;
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

function redactDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username) {
      parsed.username = '***';
    }
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return url.replace(/:[^:@/]+@/, ':***@');
  }
}

async function createPrismaClientWithRetry(
  url: string,
  maxAttempts = 3,
  delayMs = 500
): Promise<PrismaClient> {
  const redactedUrl = redactDatabaseUrl(url);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = new PrismaClient({
        datasources: {
          db: {
            url,
          },
        },
      });
      await client.$connect();
      return client;
    } catch (error) {
      lastError = error;
      console.warn(
        `[test-db] Failed to connect to ${redactedUrl} (attempt ${attempt}/${maxAttempts})`,
        error
      );
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new Error(
    `Test database unreachable at ${redactedUrl}. Ensure DATABASE_URL points to an accessible test database and the service is up.`,
    { cause: lastError instanceof Error ? lastError : undefined }
  );
}

// Vitest global setup hooks
export async function setup() {
  await setupTestDatabase();
}

export async function teardown() {
  await teardownTestDatabase();
}

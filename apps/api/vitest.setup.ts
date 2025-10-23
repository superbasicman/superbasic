/**
 * Vitest setup file
 * Runs before each test file
 * 
 * Note: Auth.js error logs are suppressed in vitest.config.ts via onConsoleLog
 * to keep CI output clean. Expected errors like CredentialsSignin, MissingCSRF,
 * and CallbackRouteError are intentional test cases and don't indicate failures.
 */

// Mock bcrypt to avoid native module loading issues in tests
vi.mock('bcrypt', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
  genSalt: vi.fn(),
}));

// Mock rate limiting to avoid Redis connection issues in tests
vi.mock('@repo/rate-limit', async () => {
  const actual = await vi.importActual<typeof import('@repo/rate-limit')>('@repo/rate-limit');
  
  return {
    ...actual,
    checkLimit: vi.fn().mockResolvedValue({ success: true }),
    Redis: class MockRedis {
      constructor() {}
      get() { return Promise.resolve(null); }
      set() { return Promise.resolve('OK'); }
      incr() { return Promise.resolve(1); }
      expire() { return Promise.resolve(1); }
      del() { return Promise.resolve(1); }
      zremrangebyscore() { return Promise.resolve(0); }
      zadd() { return Promise.resolve(1); }
      zcard() { return Promise.resolve(0); }
      zrange() { return Promise.resolve([]); }
    },
  };
});

// Allow tests to opt-in to the Prisma mock by setting VITEST_MOCK_DATABASE=true
const shouldMockDatabase = vi.hoisted(() => {
  const flag = process.env.VITEST_MOCK_DATABASE;
  if (!flag) {
    return false;
  }

  const normalized = flag.toLowerCase();
  return normalized !== 'false' && normalized !== '0' && normalized !== 'off';
});

if (shouldMockDatabase) {
  // Mock Prisma Client for unit tests that don't need database
  // This prevents Prisma initialization errors when routes are imported during test collection
  vi.mock('@repo/database', async () => {
    const actual = await vi.importActual<typeof import('@repo/database')>('@repo/database');

    return {
      // Mock the singleton prisma instance for unit tests
      prisma: {
        $connect: vi.fn(),
        $disconnect: vi.fn(),
        user: {
          findUnique: vi.fn(),
          findMany: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
        profile: {
          findUnique: vi.fn(),
          findMany: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
        apiKey: {
          findUnique: vi.fn(),
          findMany: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          deleteMany: vi.fn(),
        },
      },
      // Use the REAL PrismaClient constructor for integration tests
      // Integration tests create new instances with configuration
      PrismaClient: actual.PrismaClient,
    };
  });
}

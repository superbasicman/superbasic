/**
 * Vitest setup file
 * Runs before each test file
 */

// Mock bcrypt to avoid native module loading issues in tests
vi.mock('bcrypt', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
  genSalt: vi.fn(),
}));

// Mock Prisma Client for unit tests that don't need database
// This prevents Prisma initialization errors when routes are imported during test collection
vi.mock('@repo/database', () => ({
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
  PrismaClient: vi.fn(() => ({
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  })),
}));

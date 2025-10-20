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

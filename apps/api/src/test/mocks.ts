/**
 * Mock utilities for testing
 * Provides mocks for external dependencies like rate limiters
 */

import { vi } from 'vitest';

/**
 * Mock the rate limiter to always allow requests
 * Use this in tests to disable rate limiting
 */
export function mockRateLimiter() {
  // Mock the rate-limit module to return a limiter that always allows requests
  vi.mock('@repo/rate-limit', () => ({
    Redis: vi.fn(),
    createRateLimiter: vi.fn(() => ({
      checkLimit: vi.fn(async () => ({
        allowed: true,
        remaining: 10,
        reset: Math.floor(Date.now() / 1000) + 60,
      })),
      resetLimit: vi.fn(async () => {}),
    })),
  }));
}

/**
 * Restore the real rate limiter implementation
 * Call this after tests that used mockRateLimiter
 */
export function restoreRateLimiter() {
  vi.unmock('@repo/rate-limit');
}

/**
 * Mock the rate limiter to simulate rate limit exceeded
 * Use this to test rate limiting behavior
 */
export function simulateRateLimitExceeded() {
  vi.mock('@repo/rate-limit', () => ({
    Redis: vi.fn(),
    createRateLimiter: vi.fn(() => ({
      checkLimit: vi.fn(async () => ({
        allowed: false,
        remaining: 0,
        reset: Math.floor(Date.now() / 1000) + 60,
      })),
      resetLimit: vi.fn(async () => {}),
    })),
  }));
}

/**
 * Mock environment variables for testing
 * 
 * @param vars - Environment variables to set
 */
export function mockEnv(vars: Record<string, string>) {
  const originalEnv = { ...process.env };
  
  Object.assign(process.env, vars);
  
  return () => {
    process.env = originalEnv;
  };
}

/**
 * Create a mock Redis client that tracks calls
 * Useful for verifying rate limiting behavior
 */
export function createMockRedis() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  
  const mockRedis = {
    zremrangebyscore: vi.fn(async (...args: unknown[]) => {
      calls.push({ method: 'zremrangebyscore', args });
      return 0;
    }),
    zcard: vi.fn(async (...args: unknown[]) => {
      calls.push({ method: 'zcard', args });
      return 0;
    }),
    zrange: vi.fn(async (...args: unknown[]) => {
      calls.push({ method: 'zrange', args });
      return [];
    }),
    zadd: vi.fn(async (...args: unknown[]) => {
      calls.push({ method: 'zadd', args });
      return 1;
    }),
    expire: vi.fn(async (...args: unknown[]) => {
      calls.push({ method: 'expire', args });
      return 1;
    }),
    del: vi.fn(async (...args: unknown[]) => {
      calls.push({ method: 'del', args });
      return 1;
    }),
    getCalls: () => calls,
    clearCalls: () => {
      calls.length = 0;
    },
  };
  
  return mockRedis;
}

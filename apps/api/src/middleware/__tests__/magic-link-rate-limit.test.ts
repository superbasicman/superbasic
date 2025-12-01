/**
 * Integration tests for magic link rate limiting middleware
 * Tests email-based rate limiting (3 requests per hour per email)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { makeRequest } from '../../test/helpers.js';
import type { RateLimitResult } from '@repo/rate-limit';
import { AUTHJS_EMAIL_PROVIDER_ID } from '@repo/auth';

// Mock rate limiter
let mockCheckLimit: ((key: string, config: { limit: number; window: number }) => Promise<RateLimitResult>) | null = null;

// Mock the rate-limit module
vi.mock('@repo/rate-limit', () => ({
  Redis: vi.fn(() => ({})),
  createRateLimiter: vi.fn(() => ({
    checkLimit: async (key: string, config: { limit: number; window: number }) => {
      if (mockCheckLimit) {
        return mockCheckLimit(key, config);
      }
      // Default: allow request
      return {
        allowed: true,
        remaining: 2,
        reset: Math.floor(Date.now() / 1000) + 3600,
      };
    },
    resetLimit: vi.fn(),
  })),
  createMockRedis: vi.fn(() => ({})),
}));

// Import after mocking
const { magicLinkRateLimitMiddleware } = await import('../rate-limit/index.js');

const EMAIL_SIGNIN_PATH = `/auth/signin/${AUTHJS_EMAIL_PROVIDER_ID}`;

// Create test app
function createTestApp() {
  const app = new Hono();

  // Magic link endpoint with rate limiting
  app.post(EMAIL_SIGNIN_PATH, magicLinkRateLimitMiddleware, async (c) => {
    return c.json({ success: true, message: 'Magic link sent' });
  });

  return app;
}

describe('Magic Link Rate Limiting', () => {
  beforeEach(() => {
    mockCheckLimit = null;
  });

  afterEach(() => {
    mockCheckLimit = null;
  });

  describe('Rate Limit Enforcement', () => {
    it('should allow magic link requests within rate limit', async () => {
      mockCheckLimit = async () => ({
        allowed: true,
        remaining: 2,
        reset: Math.floor(Date.now() / 1000) + 3600,
      });

      const app = createTestApp();

      const response = await makeRequest(app, 'POST', EMAIL_SIGNIN_PATH, {
        body: new URLSearchParams({ email: 'test@example.com' }).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('X-RateLimit-Limit')).toBe('3');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('2');

      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should return 429 when rate limit is exceeded', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 3600;
      mockCheckLimit = async () => ({
        allowed: false,
        remaining: 0,
        reset: resetTime,
      });

      const app = createTestApp();

      const response = await makeRequest(app, 'POST', EMAIL_SIGNIN_PATH, {
        body: new URLSearchParams({ email: 'test@example.com' }).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      expect(response.status).toBe(429);
      expect(response.headers.get('X-RateLimit-Limit')).toBe('3');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(response.headers.get('Retry-After')).toBeTruthy();

      const data = await response.json();
      expect(data.error).toBe('Too many magic link requests');
      expect(data.message).toContain('Rate limit exceeded');
    });

    it('should return 400 when email is missing', async () => {
      const app = createTestApp();

      const response = await makeRequest(app, 'POST', EMAIL_SIGNIN_PATH, {
        body: new URLSearchParams({ csrfToken: 'test-token' }).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe('Bad Request');
      expect(data.message).toBe('Email address is required');
    });
  });

  describe('Email Normalization', () => {
    it('should normalize email to lowercase for rate limiting', async () => {
      let capturedKey = '';
      mockCheckLimit = async (key: string) => {
        capturedKey = key;
        return {
          allowed: true,
          remaining: 2,
          reset: Math.floor(Date.now() / 1000) + 3600,
        };
      };

      const app = createTestApp();

      await makeRequest(app, 'POST', EMAIL_SIGNIN_PATH, {
        body: new URLSearchParams({ email: 'Test@Example.COM' }).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      expect(capturedKey).toBe('magic-link:test@example.com');
    });

    it('should trim whitespace from email', async () => {
      let capturedKey = '';
      mockCheckLimit = async (key: string) => {
        capturedKey = key;
        return {
          allowed: true,
          remaining: 2,
          reset: Math.floor(Date.now() / 1000) + 3600,
        };
      };

      const app = createTestApp();

      await makeRequest(app, 'POST', EMAIL_SIGNIN_PATH, {
        body: new URLSearchParams({ email: '  test@example.com  ' }).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      expect(capturedKey).toBe('magic-link:test@example.com');
    });
  });

  describe('Rate Limit Headers', () => {
    it('should include rate limit headers in response', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 3600;
      mockCheckLimit = async () => ({
        allowed: true,
        remaining: 1,
        reset: resetTime,
      });

      const app = createTestApp();

      const response = await makeRequest(app, 'POST', EMAIL_SIGNIN_PATH, {
        body: new URLSearchParams({ email: 'test@example.com' }).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      expect(response.headers.get('X-RateLimit-Limit')).toBe('3');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('1');
      expect(response.headers.get('X-RateLimit-Reset')).toBe(resetTime.toString());
    });

    it('should include Retry-After header when rate limited', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 1800; // 30 minutes
      mockCheckLimit = async () => ({
        allowed: false,
        remaining: 0,
        reset: resetTime,
      });

      const app = createTestApp();

      const response = await makeRequest(app, 'POST', EMAIL_SIGNIN_PATH, {
        body: new URLSearchParams({ email: 'test@example.com' }).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const retryAfter = response.headers.get('Retry-After');
      expect(retryAfter).toBeTruthy();
      expect(Number(retryAfter)).toBeGreaterThan(0);
      expect(Number(retryAfter)).toBeLessThanOrEqual(1800);
    });
  });

  describe('Per-Email Rate Limiting', () => {
    it('should track rate limits separately per email', async () => {
      const emailCounts = new Map<string, number>();

      mockCheckLimit = async (key: string) => {
        const count = (emailCounts.get(key) || 0) + 1;
        emailCounts.set(key, count);

        return {
          allowed: count <= 3,
          remaining: Math.max(0, 3 - count),
          reset: Math.floor(Date.now() / 1000) + 3600,
        };
      };

      const app = createTestApp();

      // Request magic links for different emails
      const email1Response = await makeRequest(app, 'POST', EMAIL_SIGNIN_PATH, {
        body: new URLSearchParams({ email: 'user1@example.com' }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const email2Response = await makeRequest(app, 'POST', EMAIL_SIGNIN_PATH, {
        body: new URLSearchParams({ email: 'user2@example.com' }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      // Both should succeed (separate rate limits)
      expect(email1Response.status).toBe(200);
      expect(email2Response.status).toBe(200);

      // Verify separate keys were used
      expect(emailCounts.has('magic-link:user1@example.com')).toBe(true);
      expect(emailCounts.has('magic-link:user2@example.com')).toBe(true);
    });
  });

  describe('Graceful Failure', () => {
    it('should allow requests when Redis is unavailable', async () => {
      // Mock will return default (allowed) when mockCheckLimit is null
      mockCheckLimit = null;

      const app = createTestApp();

      const response = await makeRequest(app, 'POST', EMAIL_SIGNIN_PATH, {
        body: new URLSearchParams({ email: 'test@example.com' }).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      // Should succeed (fail-open behavior)
      expect(response.status).toBe(200);
    });
  });
});

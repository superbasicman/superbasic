import { Context, Next } from 'hono';
import { Redis, createRateLimiter } from '@repo/rate-limit';
import { authEvents } from '@repo/auth-core';

// Initialize Redis client if credentials are available
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const limiter = redis ? createRateLimiter(redis) : null;

/**
 * Rate limiting middleware for credentials authentication
 * Limits requests to 5 per minute per IP address
 */
export async function credentialsRateLimitMiddleware(c: Context, next: Next) {
  // Skip rate limiting if Redis is not configured (development)
  if (!limiter) {
    console.warn('Rate limiting disabled: UPSTASH_REDIS_REST_URL not configured');
    await next();
    return;
  }

  // Extract IP address from headers or connection
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown';

  const rateLimitKey = `credentials:${ip}`;

  // Check rate limit (5 requests per minute per IP)
  const result = await limiter.checkLimit(rateLimitKey, {
    limit: 5,
    window: 60,
  });

  // Set rate limit headers
  c.header('X-RateLimit-Limit', '5');
  c.header('X-RateLimit-Remaining', result.remaining.toString());
  c.header('X-RateLimit-Reset', result.reset.toString());

  if (!result.allowed) {
    // Calculate Retry-After in seconds
    const retryAfter = result.reset - Math.floor(Date.now() / 1000);
    c.header('Retry-After', retryAfter.toString());

    // Emit audit event for rate limit violation
    try {
      const attemptsRecorded = await limiter.getUsage(rateLimitKey, {
        limit: 5,
        window: 60,
      });

      void authEvents.emit({
        type: 'auth.failed_rate_limited',
        ip,
        metadata: {
          ip,
          windowSeconds: 60,
          maxAttempts: 5,
          attemptsRecorded,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Failed to emit credentials rate limit event:', error);
    }

    return c.json(
      {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
      },
      429
    );
  }

  await next();
}

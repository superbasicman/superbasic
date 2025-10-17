import { Context, Next } from 'hono';
import { Redis, createRateLimiter } from '@repo/rate-limit';

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
 * Rate limiting middleware for authentication endpoints
 * Limits requests to 10 per minute per IP address
 */
export async function authRateLimitMiddleware(c: Context, next: Next) {
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

  // Check rate limit (10 requests per minute per IP)
  const result = await limiter.checkLimit(`auth:${ip}`, {
    limit: 10,
    window: 60,
  });

  // Set rate limit headers
  c.header('X-RateLimit-Limit', '10');
  c.header('X-RateLimit-Remaining', result.remaining.toString());
  c.header('X-RateLimit-Reset', result.reset.toString());

  if (!result.allowed) {
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

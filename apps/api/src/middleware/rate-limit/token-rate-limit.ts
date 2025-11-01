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
 * Rate limiting middleware for token creation
 * Limits token creation to 10 per hour per user
 */
export async function tokenCreationRateLimitMiddleware(c: Context, next: Next) {
  // Skip rate limiting if Redis is not configured (development)
  if (!limiter) {
    console.warn('Rate limiting disabled: UPSTASH_REDIS_REST_URL not configured');
    await next();
    return;
  }

  // Extract userId from context (set by authMiddleware)
  const userId = c.get('userId') as string;

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Check rate limit (10 tokens per hour per user)
  const result = await limiter.checkLimit(`token-create:${userId}`, {
    limit: 10,
    window: 3600, // 1 hour in seconds
  });

  // Set rate limit headers
  c.header('X-RateLimit-Limit', '10');
  c.header('X-RateLimit-Remaining', result.remaining.toString());
  c.header('X-RateLimit-Reset', result.reset.toString());

  if (!result.allowed) {
    // Calculate Retry-After in seconds
    const retryAfter = result.reset - Math.floor(Date.now() / 1000);
    c.header('Retry-After', retryAfter.toString());

    return c.json(
      {
        error: 'Too many tokens created',
        message: 'Rate limit exceeded. Please try again later.',
      },
      429
    );
  }

  await next();
}

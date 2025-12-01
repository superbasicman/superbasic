import { Context, Next } from 'hono';
import { Redis, createRateLimiter, createMockRedis } from '@repo/rate-limit';

// Initialize Redis client if credentials are available
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    : null;

// Use mock Redis for tests, or real Redis if configured
const limiter =
  process.env.NODE_ENV === 'test'
    ? createRateLimiter(createMockRedis())
    : redis
      ? createRateLimiter(redis)
      : null;

/**
 * Rate limiting middleware for authentication endpoints
 * Limits requests to:
 * - 30 per minute per IP for refresh endpoint
 * - 10 per minute per IP for other auth endpoints
 */
export async function authRateLimitMiddleware(c: Context, next: Next) {
  // Skip rate limiting if Redis is not configured (development only, tests use mock)
  if (!limiter) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('Rate limiting disabled: UPSTASH_REDIS_REST_URL not configured');
    }
    await next();
    return;
  }

  // Extract IP address with security hardening
  // Prioritize X-Real-IP (set by trusted proxy like Vercel/Cloudflare)
  // Fallback to X-Forwarded-For, taking the LAST IP if multiple (trusted proxy appends to end)
  const forwardedFor = c.req.header('x-forwarded-for');
  const realIp = c.req.header('x-real-ip');

  let ip = 'unknown';

  if (realIp) {
    ip = realIp.trim();
  } else if (forwardedFor) {
    const ips = forwardedFor.split(',').map(i => i.trim());
    // Use the last IP in the list as it's the one added by the immediate upstream proxy
    // Assuming the immediate upstream is trusted (e.g. Vercel)
    ip = ips[ips.length - 1] || 'unknown';
  }

  // Determine rate limit based on endpoint
  const isRefresh = c.req.path.includes('/refresh');
  const limit = isRefresh ? 30 : 10;
  const keyPrefix = isRefresh ? 'auth:refresh' : 'auth:general';

  // Check rate limit
  const result = await limiter.checkLimit(`${keyPrefix}:${ip}`, {
    limit,
    window: 60,
  });

  // Set rate limit headers
  c.header('X-RateLimit-Limit', limit.toString());
  c.header('X-RateLimit-Remaining', result.remaining.toString());
  c.header('X-RateLimit-Reset', result.reset.toString());

  if (!result.allowed) {
    // Calculate Retry-After in seconds
    const retryAfter = Math.max(0, result.reset - Math.floor(Date.now() / 1000));
    c.header('Retry-After', retryAfter.toString());

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

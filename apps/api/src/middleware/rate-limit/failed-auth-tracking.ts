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
const RATE_LIMIT = 100; // Max 100 failed auth attempts per hour

/**
 * Track failed authentication attempt for rate limiting
 * Should be called when authentication fails (401 response)
 * 
 * @param ip - IP address of the request
 * @returns Promise that resolves when tracking is complete
 */
export async function trackFailedAuth(ip: string): Promise<void> {
  // Skip if Redis is not configured
  if (!limiter) {
    return;
  }

  try {
    // Increment failed auth counter (per hour per IP)
    await limiter.checkLimit(`failed-auth:${ip}`, {
      limit: RATE_LIMIT,
      window: 3600, // 1 hour in seconds
    });
  } catch (error) {
    // Log error but don't throw - tracking failures shouldn't block auth
    console.error('Failed to track failed auth attempt:', error);
  }
}

/**
 * Check if IP has exceeded failed authentication rate limit
 * Returns true if rate limit is exceeded, false otherwise
 * 
 * @param ip - IP address to check
 * @returns Promise<boolean> - true if rate limited, false otherwise
 */
export async function checkFailedAuthRateLimit(ip: string): Promise<boolean> {
  // Skip if Redis is not configured
  if (!limiter) {
    return false;
  }

  try {
    const failuresInWindow = await limiter.getUsage(`failed-auth:${ip}`, {
      limit: RATE_LIMIT,
      window: 3600, // 1 hour in seconds
    });

    return failuresInWindow >= RATE_LIMIT;
  } catch (error) {
    // On error, fail open (don't block legitimate requests)
    console.error('Failed to check failed auth rate limit:', error);
    return false;
  }
}

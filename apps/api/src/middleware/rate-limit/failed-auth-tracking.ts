import { Redis, createRateLimiter } from '@repo/rate-limit';
import { logger } from '@repo/observability';

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
const WINDOW_SECONDS = 3600;

function failedAuthKey(ip: string): string {
  return `failed-auth:${ip}`;
}

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
    await limiter.checkLimit(failedAuthKey(ip), {
      limit: RATE_LIMIT,
      window: WINDOW_SECONDS,
    });
  } catch (error) {
    // Log error but don't throw - tracking failures shouldn't block auth
    logger.error(
      {
        err: error,
        ip,
        rateLimit: RATE_LIMIT,
        windowSeconds: WINDOW_SECONDS,
        context: 'failed-auth-tracking',
      },
      'Failed to record failed auth attempt'
    );
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
    const failuresInWindow = await limiter.getUsage(failedAuthKey(ip), {
      limit: RATE_LIMIT,
      window: WINDOW_SECONDS,
    });

    return failuresInWindow >= RATE_LIMIT;
  } catch (error) {
    // On error, fail open (don't block legitimate requests)
    logger.error(
      {
        err: error,
        ip,
        rateLimit: RATE_LIMIT,
        windowSeconds: WINDOW_SECONDS,
        context: 'failed-auth-tracking',
      },
      'Failed to evaluate failed auth rate limit'
    );
    return false;
  }
}

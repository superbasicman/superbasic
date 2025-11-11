import { Redis } from '@upstash/redis';

/**
 * Rate limit configuration options
 */
export interface RateLimitConfig {
  /**
   * Maximum number of requests allowed within the window
   */
  limit: number;
  /**
   * Time window in seconds
   */
  window: number;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  /**
   * Whether the request is allowed
   */
  allowed: boolean;
  /**
   * Number of requests remaining in the current window
   */
  remaining: number;
  /**
   * Unix timestamp when the rate limit resets
   */
  reset: number;
}

/**
 * Create a rate limiter instance
 *
 * @param redis - Upstash Redis client instance
 * @returns Rate limiter functions
 *
 * @example
 * ```ts
 * const redis = new Redis({ url: process.env.UPSTASH_REDIS_URL, token: process.env.UPSTASH_REDIS_TOKEN });
 * const limiter = createRateLimiter(redis);
 * const result = await limiter.checkLimit('user:123', { limit: 100, window: 60 });
 * ```
 */
export function createRateLimiter(redis: Redis) {
  /**
   * Check if a request is within rate limits
   *
   * @param key - Unique identifier for the rate limit (e.g., 'ip:127.0.0.1', 'user:123', 'api_key:abc')
   * @param config - Rate limit configuration
   * @returns Rate limit result
   */
  async function checkLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const rateLimitKey = `ratelimit:${key}`;
    const now = Date.now();
    const windowStart = now - config.window * 1000;

    // Use Redis sorted set for sliding window
    // Score is timestamp, member is unique request ID
    const requestId = `${now}:${Math.random()}`;

    try {
      // Remove old entries outside the window
      await redis.zremrangebyscore(rateLimitKey, 0, windowStart);

      // Count current requests in window
      const currentCount = await redis.zcard(rateLimitKey);

      if (currentCount >= config.limit) {
        // Rate limit exceeded
        const oldestEntry = await redis.zrange(rateLimitKey, 0, 0, { withScores: true });
        const resetTime = oldestEntry.length > 0 
          ? Math.ceil((Number(oldestEntry[1]) + config.window * 1000) / 1000)
          : Math.ceil((now + config.window * 1000) / 1000);

        return {
          allowed: false,
          remaining: 0,
          reset: resetTime,
        };
      }

      // Add current request
      await redis.zadd(rateLimitKey, { score: now, member: requestId });

      // Set expiration on the key (cleanup)
      await redis.expire(rateLimitKey, config.window + 10);

      return {
        allowed: true,
        remaining: config.limit - (currentCount + 1),
        reset: Math.ceil((now + config.window * 1000) / 1000),
      };
    } catch (error) {
      // On Redis error, fail open (allow request) but log the error
      console.error('Rate limit check failed:', error);
      return {
        allowed: true,
        remaining: config.limit - 1,
        reset: Math.ceil((now + config.window * 1000) / 1000),
      };
    }
  }

  /**
   * Retrieve the current number of requests within the configured window.
   *
   * @param key - Unique identifier for the rate limit (e.g., 'ip:127.0.0.1')
   * @param config - Rate limit configuration
   * @returns Number of requests in the active window
   */
  async function getUsage(key: string, config: RateLimitConfig): Promise<number> {
    const rateLimitKey = `ratelimit:${key}`;
    const now = Date.now();
    const windowStart = now - config.window * 1000;

    // Remove expired entries to keep the window accurate
    await redis.zremrangebyscore(rateLimitKey, 0, windowStart);

    return redis.zcard(rateLimitKey);
  }

  /**
   * Reset rate limit for a specific key
   *
   * @param key - Unique identifier for the rate limit
   */
  async function resetLimit(key: string): Promise<void> {
    // Placeholder implementation
    // TODO: Implement rate limit reset with sliding window cleanup
    await redis.del(`ratelimit:${key}`);
  }

  return {
    checkLimit,
    getUsage,
    resetLimit,
  };
}

/**
 * Common rate limit presets
 */
export const RateLimitPresets = {
  /**
   * Strict limit for authentication endpoints (5 requests per minute)
   */
  AUTH: { limit: 10, window: 60 },
  /**
   * Standard API limit (100 requests per minute)
   */
  API: { limit: 100, window: 60 },
  /**
   * Generous limit for read operations (1000 requests per minute)
   */
  READ: { limit: 1000, window: 60 },
  /**
   * Restrictive limit for write operations (30 requests per minute)
   */
  WRITE: { limit: 30, window: 60 },
} as const;

export { Redis } from '@upstash/redis';

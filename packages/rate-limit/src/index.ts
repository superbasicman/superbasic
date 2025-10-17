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
    // Placeholder implementation
    // TODO: Implement sliding window rate limiting with Upstash Redis
    const rateLimitKey = `ratelimit:${key}`;
    const now = Math.floor(Date.now() / 1000);

    // For now, just return a permissive result
    // Real implementation will use Redis sorted sets for sliding window
    void rateLimitKey; // Acknowledge key usage for placeholder

    return {
      allowed: true,
      remaining: config.limit - 1,
      reset: now + config.window,
    };
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
  AUTH: { limit: 5, window: 60 },
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

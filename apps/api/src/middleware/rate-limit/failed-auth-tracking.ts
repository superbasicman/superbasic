import { Redis, createRateLimiter, createMockRedis } from '@repo/rate-limit';
import { logger } from '@repo/observability';
import { authEvents } from '@repo/auth-core';

// Initialize Redis client if credentials are available
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const mockRedis = process.env.NODE_ENV === 'test' ? createMockRedis() : null;

const limiter =
  process.env.NODE_ENV === 'test'
    ? createRateLimiter(mockRedis)
    : redis
      ? createRateLimiter(redis)
      : null;
const RATE_LIMIT = 100; // Max 100 failed auth attempts per hour
const WINDOW_SECONDS = 3600;

function failedAuthKey(ip: string): string {
  return `failed-auth:${ip}`;
}

function failedAuthUserKey(identifier: string): string {
  return `failed-auth:user:${identifier}`;
}

/**
 * Track failed authentication attempt for rate limiting
 * Should be called when authentication fails (401 response)
 *
 * @param ip - IP address of the request
 * @param identifier - Optional user identifier (email, userId, etc.)
 * @returns Promise that resolves when tracking is complete
 */
export async function trackFailedAuth(ip: string, identifier?: string): Promise<void> {
  // Skip if Redis is not configured
  if (!limiter) {
    return;
  }

  try {
    // Track per IP
    await trackKey(ip, failedAuthKey(ip));

    // Track per User if identifier provided
    if (identifier) {
      await trackKey(ip, failedAuthUserKey(identifier), identifier);
    }
  } catch (error) {
    // Log error but don't throw - tracking failures shouldn't block auth
    logger.error(
      {
        err: error,
        ip,
        identifier,
        rateLimit: RATE_LIMIT,
        windowSeconds: WINDOW_SECONDS,
        context: 'failed-auth-tracking',
      },
      'Failed to record failed auth attempt'
    );
  }
}

async function trackKey(ip: string, key: string, identifier?: string) {
  if (!limiter) return;

  await limiter.checkLimit(key, {
    limit: RATE_LIMIT,
    window: WINDOW_SECONDS,
  });

  const attemptsRecorded = await limiter.getUsage(key, {
    limit: RATE_LIMIT,
    window: WINDOW_SECONDS,
  });

  if (attemptsRecorded >= RATE_LIMIT) {
    authEvents.emit({
      type: 'auth.failed_rate_limited',
      metadata: {
        ip,
        identifier,
        windowSeconds: WINDOW_SECONDS,
        maxAttempts: RATE_LIMIT,
        attemptsRecorded,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Check if IP or User has exceeded failed authentication rate limit
 * Returns true if rate limit is exceeded, false otherwise
 *
 * @param ip - IP address to check
 * @param identifier - Optional user identifier to check
 * @returns Promise<boolean> - true if rate limited, false otherwise
 */
export async function checkFailedAuthRateLimit(ip: string, identifier?: string): Promise<boolean> {
  // Skip if Redis is not configured
  if (!limiter) {
    return false;
  }

  try {
    const ipFailures = await limiter.getUsage(failedAuthKey(ip), {
      limit: RATE_LIMIT,
      window: WINDOW_SECONDS,
    });

    if (ipFailures >= RATE_LIMIT) {
      return true;
    }

    if (identifier) {
      const userFailures = await limiter.getUsage(failedAuthUserKey(identifier), {
        limit: RATE_LIMIT,
        window: WINDOW_SECONDS,
      });

      if (userFailures >= RATE_LIMIT) {
        return true;
      }
    }

    return false;
  } catch (error) {
    // On error, fail open (don't block legitimate requests)
    logger.error(
      {
        err: error,
        ip,
        identifier,
        rateLimit: RATE_LIMIT,
        windowSeconds: WINDOW_SECONDS,
        context: 'failed-auth-tracking',
      },
      'Failed to evaluate failed auth rate limit'
    );
    return false;
  }
}

export function resetFailedAuthRateLimit() {
  if (mockRedis && typeof (mockRedis as any).flushall === 'function') {
    (mockRedis as any).flushall();
  }
}

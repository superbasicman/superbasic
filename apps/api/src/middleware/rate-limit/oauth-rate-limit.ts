import type { Context, Next } from 'hono';
import { Redis, createRateLimiter, createMockRedis } from '@repo/rate-limit';
import { resolveClientIp } from './client-ip.js';

type RateLimiter = ReturnType<typeof createRateLimiter>;
type OauthFlow = 'authorize' | 'token' | 'revoke' | 'introspect';

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const mockRedis = process.env.NODE_ENV === 'test' ? createMockRedis() : null;
const sharedLimiter: RateLimiter | null =
  process.env.NODE_ENV === 'test'
    ? createRateLimiter(mockRedis)
    : redis
      ? createRateLimiter(redis)
      : null;

const DEFAULT_LIMITS: Record<OauthFlow, { limit: number; window: number }> = {
  authorize: { limit: 10, window: 60 },
  token: { limit: 30, window: 60 },
  revoke: { limit: 10, window: 60 },
  introspect: { limit: 15, window: 60 },
};

export function oauthRateLimitMiddleware(
  flow: OauthFlow,
  options: { limiter?: RateLimiter; limit?: number; window?: number } = {}
) {
  const limiter = options.limiter ?? sharedLimiter;
  const limit = options.limit ?? DEFAULT_LIMITS[flow].limit;
  const windowSeconds = options.window ?? DEFAULT_LIMITS[flow].window;

  return async (c: Context, next: Next) => {
    if (!limiter) {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('OAuth rate limiting disabled: UPSTASH_REDIS_REST_URL not configured');
      }
      await next();
      return;
    }

    const ip = resolveClientIp(c);

    // Extract client_id from query params (authorize, introspect) or body (token, revoke)
    let clientId = c.req.query('client_id');
    if (!clientId && (c.req.method === 'POST' || c.req.method === 'PUT')) {
      try {
        const body = await c.req.parseBody();
        if (typeof body.client_id === 'string') {
          clientId = body.client_id;
        }
      } catch {
        // Body parsing failed - not critical for rate limiting
      }
    }

    const key = ['oauth', flow];
    if (clientId) {
      key.push(`client:${clientId}`);
    }
    key.push(`ip:${ip}`);

    const result = await limiter.checkLimit(key.join(':'), {
      limit,
      window: windowSeconds,
    });

    c.header('X-RateLimit-Limit', limit.toString());
    c.header('X-RateLimit-Remaining', result.remaining.toString());
    c.header('X-RateLimit-Reset', result.reset.toString());

    if (!result.allowed) {
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
  };
}

export function resetOauthRateLimitMocks() {
  if (mockRedis && typeof (mockRedis as any).flushall === 'function') {
    (mockRedis as any).flushall();
  }
}

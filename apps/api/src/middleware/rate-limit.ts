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
    // Calculate Retry-After in seconds
    const retryAfter = result.reset - Math.floor(Date.now() / 1000);
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
    // Increment failed auth counter (100 per hour per IP)
    await limiter.checkLimit(`failed-auth:${ip}`, {
      limit: 100,
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
    // Check rate limit (100 failed attempts per hour per IP)
    const result = await limiter.checkLimit(`failed-auth:${ip}`, {
      limit: 100,
      window: 3600, // 1 hour in seconds
    });

    return !result.allowed;
  } catch (error) {
    // On error, fail open (don't block legitimate requests)
    console.error('Failed to check failed auth rate limit:', error);
    return false;
  }
}

/**
 * Rate limiting middleware for magic link requests
 * Limits magic link requests to 3 per hour per email address
 * 
 * This prevents abuse of the magic link system by:
 * - Limiting email spam to users
 * - Preventing enumeration attacks
 * - Reducing load on email service (Resend)
 */
export async function magicLinkRateLimitMiddleware(c: Context, next: Next) {
  // Skip rate limiting if Redis is not configured (development)
  if (!limiter) {
    console.warn('Rate limiting disabled: UPSTASH_REDIS_REST_URL not configured');
    await next();
    return;
  }

  // Extract email from request body without consuming it
  // We need to read the raw body and parse it manually to avoid consuming the stream
  const contentType = c.req.header('content-type') || '';
  
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    // Not a form submission, skip rate limiting
    await next();
    return;
  }

  // Clone the request to read the body without consuming it
  const clonedRequest = c.req.raw.clone();
  const bodyText = await clonedRequest.text();
  
  // Parse form data manually
  const params = new URLSearchParams(bodyText);
  const email = params.get('email');

  if (!email) {
    return c.json(
      {
        error: 'Bad Request',
        message: 'Email address is required',
      },
      400
    );
  }

  // Normalize email to lowercase for consistent rate limiting
  const normalizedEmail = email.toLowerCase().trim();

  // Check rate limit (3 requests per hour per email)
  const result = await limiter.checkLimit(`magic-link:${normalizedEmail}`, {
    limit: 3,
    window: 3600, // 1 hour in seconds
  });

  // Set rate limit headers
  c.header('X-RateLimit-Limit', '3');
  c.header('X-RateLimit-Remaining', result.remaining.toString());
  c.header('X-RateLimit-Reset', result.reset.toString());

  if (!result.allowed) {
    // Calculate Retry-After in seconds
    const retryAfter = result.reset - Math.floor(Date.now() / 1000);
    c.header('Retry-After', retryAfter.toString());

    return c.json(
      {
        error: 'Too many magic link requests',
        message: `Rate limit exceeded. You can request another magic link in ${Math.ceil(retryAfter / 60)} minutes.`,
      },
      429
    );
  }

  await next();
}

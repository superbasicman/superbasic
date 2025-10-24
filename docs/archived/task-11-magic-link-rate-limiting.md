# Task 11: Magic Link Rate Limiting - Completion Summary

**Date**: 2025-10-23  
**Task**: Phase 2.1, Sub-Phase 3, Task 11  
**Status**: ✅ Complete

## Overview

Implemented rate limiting for magic link requests to prevent abuse of the email authentication system. The rate limiter restricts users to 3 magic link requests per hour per email address.

## Implementation

### 1. Rate Limiting Middleware

Created `magicLinkRateLimitMiddleware` in `apps/api/src/middleware/rate-limit.ts`:

```typescript
export async function magicLinkRateLimitMiddleware(c: Context, next: Next) {
  // Clone the request to read body without consuming it
  const clonedRequest = c.req.raw.clone();
  const bodyText = await clonedRequest.text();
  
  // Parse form data manually
  const params = new URLSearchParams(bodyText);
  const email = params.get('email');
  
  // Normalize email
  const normalizedEmail = email.toLowerCase().trim();
  
  // Check rate limit (3 requests per hour per email)
  const result = await limiter.checkLimit(`magic-link:${normalizedEmail}`, {
    limit: 3,
    window: 3600, // 1 hour in seconds
  });
  
  // Return 429 if rate limited
  if (!result.allowed) {
    const retryAfter = result.reset - Math.floor(Date.now() / 1000);
    return c.json({
      error: 'Too many magic link requests',
      message: `Rate limit exceeded. You can request another magic link in ${Math.ceil(retryAfter / 60)} minutes.`,
    }, 429);
  }
  
  await next();
}
```

**Key Implementation Detail**: The middleware clones the request before reading the body to avoid consuming the request stream. This allows Auth.js to still read the body after the middleware runs.

### 2. Middleware Integration

Applied middleware to the Auth.js email signin route in `apps/api/src/app.ts`:

```typescript
// Apply magic link rate limiting before Auth.js handler
v1.use('/auth/signin/nodemailer', magicLinkRateLimitMiddleware);

// Mount Auth.js handler
v1.route('/auth', authApp);
```

**Note**: Auth.js uses "nodemailer" as the provider ID for email authentication, not "email".

### 3. Test Suite

Created comprehensive test suite in `apps/api/src/middleware/__tests__/magic-link-rate-limit.test.ts`:

**Test Coverage** (8 tests):
- ✅ Allow requests within rate limit
- ✅ Return 429 when rate limit exceeded
- ✅ Return 400 when email is missing
- ✅ Normalize email to lowercase
- ✅ Trim whitespace from email
- ✅ Include rate limit headers in response
- ✅ Include Retry-After header when rate limited
- ✅ Track rate limits separately per email
- ✅ Allow requests when Redis is unavailable (fail-open)

### 4. Manual Test Script

Created `tooling/scripts/test-magic-link-rate-limit.sh` for easy manual testing:

```bash
./tooling/scripts/test-magic-link-rate-limit.sh test@example.com
```

The script:
- Clears any existing rate limit for the email
- Makes 4 magic link requests
- Verifies first 3 succeed (302 redirect)
- Verifies 4th request is rate limited (429)
- Displays rate limit headers
- Shows retry time in minutes

### 5. Rate Limit Clear Script

Created `tooling/scripts/clear-magic-link-rate-limit.ts` to manually clear rate limits:

```bash
export $(cat apps/api/.env.local | grep UPSTASH | xargs)
pnpm tsx tooling/scripts/clear-magic-link-rate-limit.ts test@example.com
```

This is useful for:
- Resetting rate limits during development
- Testing the rate limiting behavior
- Clearing rate limits for specific users if needed

## Key Features

### Email Normalization

Email addresses are normalized before rate limiting to prevent bypass attempts:

```typescript
const normalizedEmail = email.toLowerCase().trim();
```

This ensures:
- `Test@Example.COM` → `test@example.com`
- `  test@example.com  ` → `test@example.com`
- Consistent rate limiting regardless of input format

### Helpful Error Messages

When rate limited, users receive a clear message with retry time:

```json
{
  "error": "Too many magic link requests",
  "message": "Rate limit exceeded. You can request another magic link in 45 minutes."
}
```

### Standard Rate Limit Headers

All responses include standard rate limit headers:

```
X-RateLimit-Limit: 3
X-RateLimit-Remaining: 2
X-RateLimit-Reset: 1698098400
Retry-After: 2700
```

### Fail-Open Behavior

If Redis is unavailable, the middleware:
- Logs a warning
- Allows the request to proceed
- Prevents legitimate users from being blocked by infrastructure issues

## Security Benefits

### 1. Prevents Email Spam

Limits the number of emails sent to any address, preventing:
- Malicious actors from spamming users
- Accidental repeated requests
- Email service quota exhaustion

### 2. Prevents Enumeration Attacks

Rate limiting makes it impractical to:
- Test large lists of email addresses
- Discover which emails are registered
- Automate account discovery

### 3. Reduces Email Service Load

Limits requests to Resend API:
- Prevents quota exhaustion
- Reduces costs
- Maintains service reliability

### 4. Per-Email Tracking

Rate limits are tracked per email address, not per IP:
- More accurate than IP-based limiting
- Works correctly behind proxies/NAT
- Prevents one user from blocking others

## Technical Details

### Rate Limit Key Format

```
ratelimit:magic-link:<normalized_email>
```

Example: `ratelimit:magic-link:test@example.com`

### Redis Data Structure

Uses sorted sets with sliding window algorithm:
- **Score**: Request timestamp (milliseconds)
- **Member**: Unique request ID (`${timestamp}:${random}`)
- **TTL**: Window duration + 10 seconds (cleanup)

### Algorithm

1. Remove entries older than window (1 hour)
2. Count remaining entries
3. If count >= limit (3), reject request
4. Otherwise, add new entry and allow request

### Rate Limit Configuration

```typescript
{
  limit: 3,        // Maximum requests
  window: 3600,    // Time window in seconds (1 hour)
}
```

## Testing

### Automated Tests

Run the test suite:

```bash
pnpm --filter=@repo/api test -- magic-link-rate-limit
```

**Note**: Requires test database configuration. Tests use mocked Redis client.

### Manual Testing

Use the test script:

```bash
# Start API server
pnpm dev --filter=@repo/api

# In another terminal, run test script
./tooling/scripts/test-magic-link-rate-limit.sh test@example.com
```

Expected output:
```
✓ Rate limiting working correctly!
  - First 3 requests succeeded
  - 4th request was rate limited (429)
```

### Manual curl Testing

```bash
# Clear any existing rate limit first
export $(cat apps/api/.env.local | grep UPSTASH | xargs)
pnpm tsx tooling/scripts/clear-magic-link-rate-limit.ts test@example.com

# Get CSRF token
CSRF_RESPONSE=$(curl -s -c /tmp/cookies.txt http://localhost:3000/v1/auth/csrf)
CSRF_TOKEN=$(echo "$CSRF_RESPONSE" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)

# Request magic link (repeat 4 times)
curl -i -X POST http://localhost:3000/v1/auth/signin/nodemailer \
  -b /tmp/cookies.txt \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=test@example.com&csrfToken=$CSRF_TOKEN"
```

First 3 requests: `HTTP/1.1 302 Found`  
4th request: `HTTP/1.1 429 Too Many Requests`

**Note**: Upstash Redis uses a REST API, not the Redis protocol, so `redis-cli` commands won't work. Use the `clear-magic-link-rate-limit.ts` script instead to inspect or clear rate limits.

## Files Modified

1. **apps/api/src/middleware/rate-limit.ts**
   - Added `magicLinkRateLimitMiddleware` function
   - Implements 3 requests per hour per email limit
   - Includes email normalization and helpful error messages
   - Uses request cloning to avoid consuming body

2. **apps/api/src/app.ts**
   - Imported `magicLinkRateLimitMiddleware`
   - Applied middleware to `/v1/auth/signin/nodemailer` route

3. **apps/api/src/middleware/__tests__/magic-link-rate-limit.test.ts** (new file)
   - Created comprehensive test suite with 8 tests
   - Tests rate limiting, email normalization, headers, and fail-open behavior

4. **tooling/scripts/test-magic-link-rate-limit.sh** (new file)
   - Created manual test script for easy verification
   - Tests 4 consecutive requests and verifies rate limiting
   - Automatically clears existing rate limits before testing

5. **tooling/scripts/clear-magic-link-rate-limit.ts** (new file)
   - Created utility to clear rate limits for specific emails
   - Useful for development and testing

6. **.kiro/specs/authjs-migration/tasks.md**
   - Updated Task 11 status to complete
   - Added implementation notes and sanity checks

7. **.kiro/steering/current-phase.md**
   - Updated Sub-Phase 3 progress
   - Added Task 11 achievements

8. **docs/archived/task-11-magic-link-rate-limiting.md** (new file)
   - Comprehensive documentation of implementation
   - Includes testing instructions and lessons learned

## Integration with Existing Infrastructure

### Upstash Redis

Uses the existing Redis client and rate limiter:

```typescript
import { Redis, createRateLimiter } from '@repo/rate-limit';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const limiter = createRateLimiter(redis);
```

### Consistent with Other Rate Limiters

Follows the same pattern as existing rate limiters:
- `authRateLimitMiddleware` (10 req/min per IP)
- `tokenCreationRateLimitMiddleware` (10 tokens/hour per user)
- `trackFailedAuth` (100 failed attempts/hour per IP)

### Standard Headers

Uses the same header format as other rate limiters:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
- `Retry-After` (when rate limited)

## Next Steps

**Task 12**: Create Profile Creation Helper
- Implement `ensureProfileExists(userId)` function
- Ensure profiles are created for OAuth users
- Add to Auth.js `signIn` callback

## Lessons Learned

1. **Provider ID Matters**: Auth.js uses "nodemailer" as the provider ID for email authentication, not "email". The middleware must be applied to the correct route.

2. **Request Body Consumption**: In Hono, `c.req.parseBody()` can only be called once. Middleware must clone the request (`c.req.raw.clone()`) before reading the body to avoid consuming it for downstream handlers.

3. **Email Normalization**: Always normalize email addresses (lowercase + trim) to prevent rate limit bypass through case variations or whitespace.

4. **Helpful Error Messages**: Include retry time in human-readable format (minutes) to improve user experience.

5. **Fail-Open Design**: Rate limiting should fail open (allow requests) when Redis is unavailable to prevent blocking legitimate users during infrastructure issues.

6. **Per-Email vs Per-IP**: Email-based rate limiting is more accurate than IP-based for magic links, as it prevents abuse while allowing multiple users behind the same IP.

7. **Upstash Redis REST API**: Upstash uses a REST API instead of the Redis protocol, so standard `redis-cli` commands don't work. Create custom scripts using the `@repo/rate-limit` package to interact with Redis for debugging and testing.

---

**Completion Date**: 2025-10-23  
**Next Task**: Task 12 - Create Profile Creation Helper

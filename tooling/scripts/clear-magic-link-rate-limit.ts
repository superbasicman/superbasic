#!/usr/bin/env tsx

/**
 * Clear magic link rate limit for a specific email
 * Usage: pnpm tsx tooling/scripts/clear-magic-link-rate-limit.ts <email>
 */

import { Redis } from '@repo/rate-limit';

const email = process.argv[2];

if (!email) {
  console.error('Error: Email address required');
  console.log('Usage: pnpm tsx tooling/scripts/clear-magic-link-rate-limit.ts <email>');
  process.exit(1);
}

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!redisUrl || !redisToken) {
  console.error('Error: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set');
  process.exit(1);
}

const redis = new Redis({
  url: redisUrl,
  token: redisToken,
});

const normalizedEmail = email.toLowerCase().trim();
const key = `ratelimit:magic-link:${normalizedEmail}`;

console.log(`Clearing rate limit for: ${normalizedEmail}`);
console.log(`Redis key: ${key}`);

try {
  const result = await redis.del(key);

  if (result === 1) {
    console.log('✓ Rate limit cleared successfully');
  } else {
    console.log('ℹ No rate limit found (already clear)');
  }
} catch (error) {
  console.error('Error clearing rate limit:', error);
  process.exit(1);
}

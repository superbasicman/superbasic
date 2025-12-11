import { beforeEach, describe, expect, it } from 'vitest';
import { type AuthEvent, authEvents } from '@repo/auth-core';
import {
  checkFailedAuthRateLimit,
  resetFailedAuthRateLimit,
  trackFailedAuth,
} from './failed-auth-tracking.js';

const LIMIT = 100;

describe('failed-auth-tracking', () => {
  beforeEach(() => {
    resetFailedAuthRateLimit();
    authEvents.clearHandlers();
  });

  it('emits an audit event when the limit is exceeded', async () => {
    const events: AuthEvent[] = [];
    authEvents.on((event) => {
      events.push(event);
    });

    for (let i = 0; i < LIMIT; i++) {
      await trackFailedAuth('203.0.113.5');
    }

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(events.some((event) => event.type === 'auth.failed_rate_limited')).toBe(true);
  });

  it('returns true once the limit is reached for an IP', async () => {
    for (let i = 0; i < LIMIT; i++) {
      await trackFailedAuth('203.0.113.6');
    }

    const limited = await checkFailedAuthRateLimit('203.0.113.6');
    expect(limited).toBe(true);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { authEvents } from '../events.js';

describe('authEvents emitter', () => {
  beforeEach(() => {
    authEvents.clearHandlers();
  });

  it('attaches a timestamp to emitted events', async () => {
    const timestamps: Date[] = [];
    authEvents.on((event) => {
      timestamps.push(event.timestamp);
    });

    await authEvents.emit({
      type: 'token.created',
      userId: 'user_1',
      metadata: {
        tokenId: 'tok_123',
        tokenName: 'Demo Token',
        scopes: ['read:transactions'],
        expiresAt: new Date().toISOString(),
        ip: '203.0.113.2',
        userAgent: 'vitest',
        timestamp: new Date().toISOString(),
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(timestamps).toHaveLength(1);
    expect(timestamps[0]).toBeInstanceOf(Date);
  });

  it('keeps firing handlers when one throws', async () => {
    const calls: string[] = [];

    authEvents.on(() => {
      calls.push('first');
      throw new Error('boom');
    });

    authEvents.on(() => {
      calls.push('second');
    });

    await authEvents.emit({
      type: 'refresh.reuse_detected',
      userId: 'user_2',
      metadata: {
        tokenId: 'tok_456',
        sessionId: 'sess_1',
        familyId: 'fam_1',
        ip: '203.0.113.3',
        userAgent: 'vitest',
        timestamp: new Date().toISOString(),
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls).toEqual(['first', 'second']);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRateLimiter } from '../index.js';

class FakeRedis {
  private store = new Map<string, Array<{ score: number; member: string }>>();

  async zremrangebyscore(key: string, min: number, max: number): Promise<number> {
    const items = this.store.get(key);
    if (!items) {
      return 0;
    }

    const initialLength = items.length;
    const filtered = items.filter((entry) => entry.score < min || entry.score > max);
    this.store.set(key, filtered);
    return initialLength - filtered.length;
  }

  async zcard(key: string): Promise<number> {
    return this.store.get(key)?.length ?? 0;
  }

  async zadd(
    key: string,
    payload: {
      score: number;
      member: string;
    }
  ): Promise<number> {
    const items = this.store.get(key) ?? [];
    items.push({ score: payload.score, member: payload.member });
    items.sort((a, b) => a.score - b.score);
    this.store.set(key, items);
    return 1;
  }

  async expire(): Promise<number> {
    // No-op for tests; TTL is not simulated
    return 1;
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async zrange(
    key: string,
    start: number,
    stop: number,
    options?: { withScores?: boolean }
  ): Promise<string[]> {
    const items = this.store.get(key) ?? [];
    const slice = items.slice(start, stop === -1 ? undefined : stop + 1);

    if (options?.withScores) {
      const result: string[] = [];
      for (const entry of slice) {
        result.push(entry.member, entry.score.toString());
      }
      return result;
    }

    return slice.map((entry) => entry.member);
  }
}

describe('rate limiter sliding window', () => {
  const config = { limit: 3, window: 60 };
  let redis: FakeRedis;
  let limiter: ReturnType<typeof createRateLimiter>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    redis = new FakeRedis();
    limiter = createRateLimiter(redis as unknown as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests within the configured limit', async () => {
    for (let i = 0; i < config.limit; i++) {
      const result = await limiter.checkLimit('user:123', config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(config.limit - (i + 1));
    }

    const usage = await limiter.getUsage('user:123', config);
    expect(usage).toBe(config.limit);
  });

  it('blocks requests that exceed the limit', async () => {
    await limiter.checkLimit('ip:10.0.0.1', config);
    await limiter.checkLimit('ip:10.0.0.1', config);
    await limiter.checkLimit('ip:10.0.0.1', config);

    const result = await limiter.checkLimit('ip:10.0.0.1', config);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);

    const usage = await limiter.getUsage('ip:10.0.0.1', config);
    expect(usage).toBe(config.limit);
  });

  it('evicts entries outside the sliding window', async () => {
    await limiter.checkLimit('session:abc', config);

    // Advance time beyond the 60 second window
    vi.advanceTimersByTime((config.window + 1) * 1000);

    const usage = await limiter.getUsage('session:abc', config);
    expect(usage).toBe(0);
  });
});

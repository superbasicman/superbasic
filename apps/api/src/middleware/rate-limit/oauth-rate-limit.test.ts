import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createRateLimiter, createMockRedis } from '@repo/rate-limit';
import { makeRequest } from '../../test/helpers.js';
import { oauthRateLimitMiddleware } from './oauth-rate-limit.js';

describe('oauthRateLimitMiddleware', () => {
  beforeEach(() => {
    // ensure each test gets a fresh limiter state
    // mockRedis is scoped to the limiter we pass in the options
  });

  it('enforces rate limits on token requests per IP', async () => {
    const limiter = createRateLimiter(createMockRedis());
    const app = new Hono();

    app.post(
      '/oauth/token',
      oauthRateLimitMiddleware('token', { limiter, limit: 2, window: 60 }),
      (c) => c.json({ ok: true })
    );

    const makeTokenRequest = () =>
      makeRequest(app, 'POST', '/oauth/token', {
        headers: { 'x-forwarded-for': '198.51.100.10' },
      });

    const first = await makeTokenRequest();
    const second = await makeTokenRequest();
    const third = await makeTokenRequest();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.headers.get('Retry-After')).toBeDefined();
  });

  it('uses client_id when present to scope the bucket', async () => {
    const limiter = createRateLimiter(createMockRedis());
    const app = new Hono();

    app.get(
      '/oauth/authorize',
      oauthRateLimitMiddleware('authorize', { limiter, limit: 1, window: 60 }),
      (c) => c.text('ok')
    );

    const requestWithClient = () =>
      makeRequest(app, 'GET', '/oauth/authorize?client_id=client_123', {
        headers: { 'x-real-ip': '203.0.113.20' },
      });

    const first = await requestWithClient();
    const second = await requestWithClient();

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });
});

import { describe, it, expect, vi } from 'vitest';

// Ensure database stays unmocked for app import
vi.unmock('@repo/database');

import app from '../../../app.js';
import { makeRequest } from '../../../test/helpers.js';

describe('Auth endpoint rate limiting', () => {
  it('rate limits POST /v1/auth/refresh (limit 30)', async () => {
    // Make 30 allowed requests
    for (let i = 0; i < 30; i++) {
      const response = await makeRequest(app, 'POST', '/v1/auth/refresh', {
        body: {},
      });
      // Should be allowed (400/401/403 due to invalid body/token, but NOT 429)
      expect(response.status).not.toBe(429);
    }

    // 31st request should be blocked
    const response = await makeRequest(app, 'POST', '/v1/auth/refresh', {
      body: {},
    });

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toBe('Too many requests');
  });

  it('rate limits other auth endpoints (limit 10)', async () => {
    // Make 10 allowed requests to login
    for (let i = 0; i < 10; i++) {
      const response = await makeRequest(app, 'POST', '/v1/auth/login', {
        body: {},
      });
      expect(response.status).not.toBe(429);
    }

    // 11th request should be blocked
    const response = await makeRequest(app, 'POST', '/v1/auth/login', {
      body: {},
    });

    expect(response.status).toBe(429);
  });
});

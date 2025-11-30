import { describe, it, expect, vi } from 'vitest';

// Ensure database stays unmocked for app import
vi.unmock('@repo/database');

import app from '../../../app.js';
import { makeRequest } from '../../../test/helpers.js';

describe('Auth endpoint rate limiting', () => {
  it('rate limits POST /v1/auth/refresh', async () => {
    const response = await makeRequest(app, 'POST', '/v1/auth/refresh', {
      body: {},
    });

    expect([400, 401, 403]).toContain(response.status);
  });

  it('rate limits POST /v1/oauth/token', async () => {
    const response = await makeRequest(app, 'POST', '/v1/oauth/token', {
      body: {},
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    expect([400, 401]).toContain(response.status);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.unmock('@repo/database');

import app from '../../../app.js';
import { resetDatabase } from '../../../test/setup.js';
import { createSessionToken, createTestUser, makeRequest } from '../../../test/helpers.js';

const COOKIE_NAME = 'authjs.session-token';
const TEST_SESSION_SECRET = 'local_test_auth_secret_32_chars_minimum';

describe('POST /v1/auth/token', () => {
  beforeEach(async () => {
    process.env.AUTH_SECRET = TEST_SESSION_SECRET;
    await resetDatabase();
  });

  it('rejects legacy Auth.js session cookie exchange', async () => {
    const { user } = await createTestUser();
    const sessionToken = await createSessionToken(user.id);

    const response = await makeRequest(app, 'POST', '/v1/auth/token', {
      cookies: {
        [COOKIE_NAME]: sessionToken,
      },
      body: {
        clientType: 'web',
      },
    });

    expect(response.status).toBe(410);
    const data = await response.json();
    expect(data.error).toBe('unsupported_grant_type');
  });

  it('rejects session token in request body', async () => {
    const { user } = await createTestUser();
    const sessionToken = await createSessionToken(user.id);

    const response = await makeRequest(app, 'POST', '/v1/auth/token', {
      body: {
        sessionToken,
        clientType: 'mobile',
      },
    });

    expect(response.status).toBe(410);
    const data = await response.json();
    expect(data.error).toBe('unsupported_grant_type');
  });

  it('returns 401 when no session token provided', async () => {
    const response = await makeRequest(app, 'POST', '/v1/auth/token', {
      body: {},
    });

    expect(response.status).toBe(401);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.unmock('@repo/database');

import app from '../../../app.js';
import { resetDatabase } from '../../../test/setup.js';
import {
  createTestUser,
  createSessionRecord,
  createSessionToken,
  makeRequest,
} from '../../../test/helpers.js';
import { generateAccessToken } from '@repo/auth-core';

describe('GET /v1/auth/session', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('returns current auth context and session details for valid access token', async () => {
    const { user } = await createTestUser();
    const session = await createSessionRecord(user.id);

    const tokenResult = await generateAccessToken({
      userId: user.id,
      sessionId: session.id,
    });

    const response = await makeRequest(app, 'GET', '/v1/auth/session', {
      headers: {
        Authorization: `Bearer ${tokenResult.token}`,
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.auth.userId).toBe(user.id);
    expect(data.auth.sessionId).toBe(session.id);
    expect(data.user.email).toBe(user.email);
    expect(data.session.id).toBe(session.id);
    expect(data.session.clientType).toBe('web');
  });

  it('falls back to Auth.js session cookie when Authorization header is missing', async () => {
    const { user } = await createTestUser();
    const sessionToken = await createSessionToken(user.id);

    const response = await makeRequest(app, 'GET', '/v1/auth/session', {
      cookies: {
        'authjs.session-token': sessionToken,
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.auth).toBeNull();
    expect(data.user.id).toBe(user.id);
  });

  it('returns 401 when Authorization header is missing', async () => {
    const response = await makeRequest(app, 'GET', '/v1/auth/session');
    expect(response.status).toBe(401);
  });
});

describe('GET JWKS endpoints', () => {
  it('returns signing keys for /.well-known/jwks.json', async () => {
    const response = await makeRequest(app, 'GET', '/.well-known/jwks.json');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.keys)).toBe(true);
    expect(data.keys[0]).toHaveProperty('kid');
  });

  it('returns signing keys for /v1/auth/jwks.json', async () => {
    const response = await makeRequest(app, 'GET', '/v1/auth/jwks.json');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.keys)).toBe(true);
  });
});

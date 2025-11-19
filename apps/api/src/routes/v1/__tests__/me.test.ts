import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.unmock('@repo/database');

import app from '../../../app.js';
import { resetDatabase, getTestPrisma } from '../../../test/setup.js';
import { createTestUser, createAccessToken, makeAuthenticatedRequest, makeRequest } from '../../../test/helpers.js';

describe('GET /v1/me', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('returns profile data for a valid access token', async () => {
    const { user } = await createTestUser({ name: 'Profile User' });
    const { token } = await createAccessToken(user.id);

    const response = await makeAuthenticatedRequest(app, 'GET', '/v1/me', token);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.user.id).toBe(user.id);
    expect(data.user.email).toBe(user.email);
    expect(data.user.name).toBe('Profile User');
  });

  it('returns 404 when the authenticated user is missing a profile', async () => {
    const { user } = await createTestUser();
    const { token } = await createAccessToken(user.id);
    const client = getTestPrisma();
    await client.profile.deleteMany({ where: { userId: user.id } });

    const response = await makeAuthenticatedRequest(app, 'GET', '/v1/me', token);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Profile not found');
  });

  it('returns 401 when Authorization header is missing', async () => {
    const response = await makeRequest(app, 'GET', '/v1/me');
    expect(response.status).toBe(401);
  });

  it('returns 401 for invalid Bearer tokens', async () => {
    const response = await makeRequest(app, 'GET', '/v1/me', {
      headers: { Authorization: 'Bearer not-a-valid-token' },
    });

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 401 when the backing session has expired', async () => {
    const { user } = await createTestUser();
    const { token } = await createAccessToken(user.id, { expiresInSeconds: -3600 });

    const response = await makeAuthenticatedRequest(app, 'GET', '/v1/me', token);

    expect(response.status).toBe(401);
  });
});

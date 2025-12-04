import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.unmock('@repo/database');

import app from '../../../app.js';
import { resetDatabase, getTestPrisma } from '../../../test/setup.js';
import {
  createTestUser,
  createSessionRecord,
  makeRequest,
  createAccessToken,
} from '../../../test/helpers.js';
import { generateAccessToken } from '@repo/auth-core';
import { authService } from '../../../lib/auth-service.js';
import { REFRESH_TOKEN_COOKIE } from '../auth/refresh-cookie.js';

const prisma = getTestPrisma;

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

  it('returns 401 when Authorization header is missing', async () => {
    const response = await makeRequest(app, 'GET', '/v1/auth/session');
    expect(response.status).toBe(401);
  });

  it('revokes all sessions for the user', async () => {
    const { user } = await createTestUser();
    const { token: accessToken, session } = await createAccessToken(user.id);
    const otherSession = await createSessionRecord(user.id);

    const response = await makeRequest(app, 'POST', '/v1/auth/sessions/revoke-all', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.status).toBe(204);

    const sessions = await prisma().authSession.findMany({
      where: { userId: user.id },
    });
    const revokedIds = sessions.filter((s: any) => s.revokedAt !== null).map((s: any) => s.id);
    expect(revokedIds).toEqual(expect.arrayContaining([session.id, otherSession.id]));
  });
});

describe('GET /v1/auth/sessions', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('lists active sessions for the user', async () => {
    const { user } = await createTestUser();
    const currentSession = await createSessionRecord(user.id);
    const otherSession = await createSessionRecord(user.id);

    const tokenResult = await generateAccessToken({
      userId: user.id,
      sessionId: currentSession.id,
    });

    const response = await makeRequest(app, 'GET', '/v1/auth/sessions', {
      headers: {
        Authorization: `Bearer ${tokenResult.token}`,
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.sessions)).toBe(true);
    expect(data.sessions).toHaveLength(2);

    const current = data.sessions.find((session: any) => session.id === currentSession.id);
    const other = data.sessions.find((session: any) => session.id === otherSession.id);

    expect(current?.isCurrent).toBe(true);
    expect(other?.isCurrent).toBe(false);
  });

  it('returns 401 without auth', async () => {
    const response = await makeRequest(app, 'GET', '/v1/auth/sessions');
    expect(response.status).toBe(401);
  });
});

describe('POST /v1/auth/logout', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('revokes current session and refresh tokens then clears cookies', async () => {
    const { user } = await createTestUser();
    const { token: accessToken, session } = await createAccessToken(user.id);

    const refresh = await authService.issueRefreshToken({
      userId: user.id,
      sessionId: session.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    const response = await makeRequest(app, 'POST', '/v1/auth/logout', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.status).toBe(204);
    const setCookies = response.headers.getSetCookie?.() ?? [];
    expect(setCookies.some((value) => value.startsWith(`${REFRESH_TOKEN_COOKIE}=`))).toBe(true);

    const updatedSession = await prisma().authSession.findUnique({ where: { id: session.id } });
    expect(updatedSession?.revokedAt).not.toBeNull();

    const refreshTokenRow = await prisma().refreshToken.findUnique({
      where: { id: refresh.token.id },
    });
    expect(refreshTokenRow?.revokedAt).not.toBeNull();
  });

  it('requires authentication', async () => {
    const response = await makeRequest(app, 'POST', '/v1/auth/logout');
    expect(response.status).toBe(401);
  });
});

describe('DELETE /v1/auth/sessions/:id', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('revokes the selected session and its refresh tokens', async () => {
    const { user } = await createTestUser();
    const { token: accessToken, session } = await createAccessToken(user.id);
    const otherSession = await createSessionRecord(user.id);

    const refresh = await authService.issueRefreshToken({
      userId: user.id,
      sessionId: otherSession.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    const response = await makeRequest(app, 'DELETE', `/v1/auth/sessions/${otherSession.id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.status).toBe(204);

    const updated = await prisma().authSession.findUnique({ where: { id: otherSession.id } });
    expect(updated?.revokedAt).not.toBeNull();

    const refreshTokenRow = await prisma().refreshToken.findUnique({
      where: { id: refresh.token.id },
    });
    expect(refreshTokenRow?.revokedAt).not.toBeNull();

    const currentSession = await prisma().authSession.findUnique({ where: { id: session.id } });
    expect(currentSession?.revokedAt).toBeNull();
  });

  it('clears refresh cookie when deleting the current session', async () => {
    const { user } = await createTestUser();
    const { token: accessToken, session } = await createAccessToken(user.id);

    const response = await makeRequest(app, 'DELETE', `/v1/auth/sessions/${session.id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.status).toBe(204);
    const setCookies = response.headers.getSetCookie?.() ?? [];
    expect(setCookies.some((value) => value.startsWith(`${REFRESH_TOKEN_COOKIE}=`))).toBe(true);
  });

  it('returns 404 for sessions that do not belong to the user', async () => {
    const { user } = await createTestUser();
    const otherUser = await createTestUser();
    const foreignSession = await createSessionRecord(otherUser.user.id);
    const { token: accessToken } = await createAccessToken(user.id);

    const response = await makeRequest(app, 'DELETE', `/v1/auth/sessions/${foreignSession.id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.status).toBe(404);
  });

  it('requires authentication', async () => {
    const response = await makeRequest(app, 'DELETE', '/v1/auth/sessions/abc');
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

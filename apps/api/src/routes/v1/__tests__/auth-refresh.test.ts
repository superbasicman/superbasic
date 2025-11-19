import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.unmock('@repo/database');

import app from '../../../app.js';
import { resetDatabase, getTestPrisma } from '../../../test/setup.js';
import {
  createTestUser,
  createSessionRecord,
  makeRequest,
} from '../../../test/helpers.js';
import { refreshTokenService } from '../../../lib/refresh-token-service.js';
import { REFRESH_TOKEN_COOKIE } from '../auth/refresh-cookie.js';

describe('POST /v1/auth/refresh', () => {
  const prisma = getTestPrisma;

  beforeEach(async () => {
    await resetDatabase();
  });

  it('rotates refresh token and returns new tokens', async () => {
    const { user } = await createTestUser();
    const session = await createSessionRecord(user.id);

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const initial = await refreshTokenService.issueRefreshToken({
      userId: user.id,
      sessionId: session.id,
      expiresAt,
    });

    const response = await makeRequest(app, 'POST', '/v1/auth/refresh', {
      body: {
        refreshToken: initial.refreshToken,
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.refreshToken).toBeTruthy();
    expect(data.accessToken).toBeTruthy();
    expect(data.refreshToken).not.toBe(initial.refreshToken);

    const setCookie = response.headers.getSetCookie?.() ?? [];
    const hasRefreshCookie = setCookie.some((value) =>
      value.startsWith(`${REFRESH_TOKEN_COOKIE}=`) && value.includes('HttpOnly')
    );
    expect(hasRefreshCookie).toBe(true);

    const dbToken = await prisma().token.findUnique({ where: { id: initial.token.id } });
    expect(dbToken?.revokedAt).not.toBeNull();
  });

  it('returns 401 for expired refresh token', async () => {
    const { user } = await createTestUser();
    const session = await createSessionRecord(user.id);

    const initial = await refreshTokenService.issueRefreshToken({
      userId: user.id,
      sessionId: session.id,
      expiresAt: new Date(Date.now() - 1000),
    });

    const response = await makeRequest(app, 'POST', '/v1/auth/refresh', {
      body: {
        refreshToken: initial.refreshToken,
      },
    });

    expect(response.status).toBe(401);
  });

  it('revokes session on reuse detection', async () => {
    const { user } = await createTestUser();
    const session = await createSessionRecord(user.id);
    const now = new Date();

    const first = await refreshTokenService.issueRefreshToken({
      userId: user.id,
      sessionId: session.id,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    });

    await prisma().token.update({
      where: { id: first.token.id },
      data: { revokedAt: now },
    });

    await refreshTokenService.issueRefreshToken({
      userId: user.id,
      sessionId: session.id,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      familyId: first.token.familyId,
    });

    const response = await makeRequest(app, 'POST', '/v1/auth/refresh', {
      body: {
        refreshToken: first.refreshToken,
      },
    });

    expect(response.status).toBe(401);
    const updatedSession = await prisma().session.findUnique({ where: { id: session.id } });
    expect(updatedSession?.revokedAt).not.toBeNull();
  });

  it('uses refresh token cookie when body is missing', async () => {
    const { user } = await createTestUser();
    const session = await createSessionRecord(user.id);

    const initial = await refreshTokenService.issueRefreshToken({
      userId: user.id,
      sessionId: session.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const response = await makeRequest(app, 'POST', '/v1/auth/refresh', {
      cookies: {
        [REFRESH_TOKEN_COOKIE]: initial.refreshToken,
      },
      body: {},
    });

    expect(response.status).toBe(200);
  });
});

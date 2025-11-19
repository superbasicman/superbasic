import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.unmock('@repo/database');

import app from '../../../app.js';
import { resetDatabase, getTestPrisma } from '../../../test/setup.js';
import { createSessionToken, createTestUser, makeRequest } from '../../../test/helpers.js';
import { authService } from '../../../lib/auth-service.js';
import { parseOpaqueToken } from '@repo/auth';
import { REFRESH_TOKEN_COOKIE } from '../auth/refresh-cookie.js';

const COOKIE_NAME = 'authjs.session-token';
const TEST_SESSION_SECRET = 'local_test_auth_secret_32_chars_minimum';

describe('POST /v1/auth/token', () => {
  beforeEach(async () => {
    process.env.AUTH_SECRET = TEST_SESSION_SECRET;
    await resetDatabase();
  });

  it('exchanges Auth.js session cookie for access + refresh tokens', async () => {
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

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(typeof data.accessToken).toBe('string');
    expect(typeof data.refreshToken).toBe('string');
    expect(data.tokenType).toBe('Bearer');
    expect(data.expiresIn).toBeGreaterThan(0);

    const verifyResponse = await authService.verifyRequest({
      authorizationHeader: `Bearer ${data.accessToken}`,
    });

    expect(verifyResponse).not.toBeNull();
    expect(verifyResponse?.userId).toBe(user.id);

    const prisma = getTestPrisma();
    const parsedRefresh = parseOpaqueToken(data.refreshToken);
    expect(parsedRefresh).not.toBeNull();

    const storedToken = await prisma.token.findUnique({
      where: { id: parsedRefresh!.tokenId },
    });

    expect(storedToken).toBeTruthy();
    expect(storedToken?.userId).toBe(user.id);
    expect(storedToken?.sessionId).toBe(verifyResponse?.sessionId);

    const setCookie = response.headers.getSetCookie?.() ?? [];
    const hasRefreshCookie = setCookie.some((value) =>
      value.startsWith(`${REFRESH_TOKEN_COOKIE}=`) && value.includes('HttpOnly')
    );
    expect(hasRefreshCookie).toBe(true);
  });

  it('allows session token in request body', async () => {
    const { user } = await createTestUser();
    const sessionToken = await createSessionToken(user.id);

    const response = await makeRequest(app, 'POST', '/v1/auth/token', {
      body: {
        sessionToken,
        clientType: 'mobile',
      },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.refreshToken).toBeTruthy();
  });

  it('returns 401 when no session token provided', async () => {
    const response = await makeRequest(app, 'POST', '/v1/auth/token', {
      body: {},
    });

    expect(response.status).toBe(401);
  });
});

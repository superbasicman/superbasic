import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.unmock('@repo/database');

import app from '../../../app.js';
import { resetDatabase, getTestPrisma } from '../../../test/setup.js';
import { createTestUser, makeRequest } from '../../../test/helpers.js';
import { REFRESH_CSRF_COOKIE, REFRESH_TOKEN_COOKIE } from '../auth/refresh-cookie.js';

const prisma = getTestPrisma;

describe('POST /v1/auth/login', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('issues access and refresh tokens for valid credentials', async () => {
    const { user, credentials } = await createTestUser();

    const response = await makeRequest(app, 'POST', '/v1/auth/login', {
      body: {
        email: credentials.email,
        password: credentials.password,
        rememberMe: true,
        clientType: 'web',
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.tokenType).toBe('Bearer');
    expect(typeof data.accessToken).toBe('string');
    expect(typeof data.refreshToken).toBe('string');
    expect(typeof data.expiresIn).toBe('number');
    expect(data.sessionId).toBeTruthy();

    const setCookies = response.headers.getSetCookie?.() ?? [];
    expect(setCookies.some((value) => value.startsWith(`${REFRESH_TOKEN_COOKIE}=`))).toBe(true);
    expect(setCookies.some((value) => value.startsWith(`${REFRESH_CSRF_COOKIE}=`))).toBe(true);

    const session = await prisma().session.findUnique({
      where: { id: data.sessionId },
    });
    expect(session?.userId).toBe(user.id);
    expect(session?.clientType).toBe('web');
    expect(session?.kind).toBe('persistent');
  });

  it('returns 401 for invalid password', async () => {
    const { credentials } = await createTestUser();

    const response = await makeRequest(app, 'POST', '/v1/auth/login', {
      body: {
        email: credentials.email,
        password: 'wrong-password',
      },
    });

    expect(response.status).toBe(401);
  });

  it('returns 403 for disabled accounts', async () => {
    const { user, credentials } = await createTestUser();
    await prisma().user.update({
      where: { id: user.id },
      data: { status: 'disabled' },
    });

    const response = await makeRequest(app, 'POST', '/v1/auth/login', {
      body: {
        email: credentials.email,
        password: credentials.password,
      },
    });

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe('account_disabled');
  });
});

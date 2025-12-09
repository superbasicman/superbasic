import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.unmock('@repo/database');

import app from '../../../app.js';
import { resetDatabase } from '../../../test/setup.js';
import {
  createTestUser,
  createSessionRecord,
  makeRequest,
  getRefreshToken,
  getAuthSession,
  updateRefreshToken,
} from '../../../test/helpers.js';
import { authService } from '../../../lib/auth-service.js';
import { REFRESH_TOKEN_COOKIE } from '../auth/refresh-cookie.js';
import { authEvents } from '@repo/auth';

describe('POST /v1/auth/refresh', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('rotates refresh token and returns new tokens', async () => {
    const { user } = await createTestUser();
    const session = await createSessionRecord(user.id);

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const initial = await authService.issueRefreshToken({
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
    const hasRefreshCookie = setCookie.some(
      (value) => value.startsWith(`${REFRESH_TOKEN_COOKIE}=`) && value.includes('HttpOnly')
    );
    expect(hasRefreshCookie).toBe(true);

    const dbToken = await getRefreshToken(initial.token.id);
    expect(dbToken?.revokedAt).not.toBeNull();
  });

  it('emits refresh.rotated audit event when rotating token', async () => {
    authEvents.clearHandlers();
    const events: any[] = [];
    authEvents.on((event) => {
      events.push(event);
    });

    const { user } = await createTestUser();
    const session = await createSessionRecord(user.id);

    const initial = await authService.issueRefreshToken({
      userId: user.id,
      sessionId: session.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const response = await makeRequest(app, 'POST', '/v1/auth/refresh', {
      body: {
        refreshToken: initial.refreshToken,
      },
      headers: {
        'user-agent': 'vitest',
      },
    });

    expect(response.status).toBe(200);

    const rotatedEvent = events.find((event) => event.type === 'refresh.rotated');
    expect(rotatedEvent).toBeDefined();
    expect(rotatedEvent?.metadata?.previousTokenId).toBe(initial.token.id);
    expect(rotatedEvent?.metadata?.newTokenId).toBeDefined();
    expect(rotatedEvent?.metadata?.sessionId).toBe(session.id);
    expect(rotatedEvent?.metadata?.userAgent).toBe('vitest');

    authEvents.clearHandlers();
  });

  it('returns 401 for expired refresh token', async () => {
    const { user } = await createTestUser();
    const session = await createSessionRecord(user.id);

    const initial = await authService.issueRefreshToken({
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

    // Seed a family and keep it stable across rotation attempts.
    const first = await authService.issueRefreshToken({
      userId: user.id,
      sessionId: session.id,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    });

    // Mark the first as reused/revoked.
    // Set revocation time to > 10s ago to bypass the benign race window
    await updateRefreshToken(first.token.id, { revokedAt: new Date(Date.now() - 15000) });

    // Create another in the same family to simulate sibling active token.
    const sibling = await authService.issueRefreshToken({
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
    const updatedSession = await getAuthSession(session.id);
    expect(updatedSession?.revokedAt).not.toBeNull();
    const siblingRow = await getRefreshToken(sibling.token.id);
    expect(siblingRow?.revokedAt).not.toBeNull();
  });

  it('uses refresh token cookie when body is missing', async () => {
    const { user } = await createTestUser();
    const session = await createSessionRecord(user.id);

    const initial = await authService.issueRefreshToken({
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

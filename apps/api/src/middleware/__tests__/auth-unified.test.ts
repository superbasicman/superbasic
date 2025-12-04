import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.unmock('@repo/database');

import { Hono } from 'hono';
import { unifiedAuthMiddleware } from '../auth-unified.js';
import { attachAuthContext } from '../auth-context.js';
import { resetDatabase, getTestPrisma } from '../../test/setup.js';
import {
  makeRequest,
  makeAuthenticatedRequest,
  createTestUser,
  createAccessToken,
  createPersonalAccessToken,
} from '../../test/helpers.js';
import type { AppBindings } from '../../types/context.js';

type UnifiedContext = AppBindings;

function createTestApp() {
  const app = new Hono<UnifiedContext>();
  app.use('*', attachAuthContext);
  app.get('/protected', unifiedAuthMiddleware, (c) => {
    return c.json({
      userId: c.get('userId'),
      profileId: c.get('profileId') ?? null,
      authType: c.get('authType'),
      tokenId: c.get('tokenId') ?? null,
      tokenScopes: c.get('tokenScopes') ?? null,
    });
  });
  return app;
}

describe('Unified Authentication Middleware', () => {
  let prisma: ReturnType<typeof getTestPrisma>;

  beforeEach(async () => {
    await resetDatabase();
    prisma = getTestPrisma();
  });

  it('authenticates PAT Bearer tokens when present', async () => {
    const { user } = await createTestUser();
    const app = createTestApp();

    const pat = await createPersonalAccessToken({
      userId: user.id,
      scopes: ['read:profile'],
    });

    const response = await makeRequest(app, 'GET', '/protected', {
      headers: { Authorization: `Bearer ${pat.token}` },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.authType).toBe('pat');
    expect(data.tokenId).toBe(pat.tokenId);
    expect(data.tokenScopes).toEqual(['read:profile']);
  });

  it('falls back to the session auth context when no PAT is supplied', async () => {
    const { user } = await createTestUser();
    const { token } = await createAccessToken(user.id);
    const app = createTestApp();

    const response = await makeAuthenticatedRequest(app, 'GET', '/protected', token);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.authType).toBe('session');
    expect(data.userId).toBe(user.id);
    expect(data.tokenId).toBeNull();
  });

  it('returns 401 when neither PAT nor access token is provided', async () => {
    const app = createTestApp();
    const response = await makeRequest(app, 'GET', '/protected');
    expect(response.status).toBe(401);
  });

  it('propagates profile context for both auth modes', async () => {
    const { user } = await createTestUser();
    const profile = await prisma.profile.findUnique({ where: { userId: user.id } });
    const app = createTestApp();

    const patToken = await createPersonalAccessToken({
      userId: user.id,
      scopes: ['read:profile'],
    });

    const patResponse = await makeRequest(app, 'GET', '/protected', {
      headers: { Authorization: `Bearer ${patToken.token}` },
    });
    const patData = await patResponse.json();
    expect(patData.userId).toBe(user.id);
    expect(patData.profileId).toBe(profile!.id);

    const { token } = await createAccessToken(user.id);
    const sessionResponse = await makeAuthenticatedRequest(app, 'GET', '/protected', token);
    const sessionData = await sessionResponse.json();
    expect(sessionData.userId).toBe(user.id);
    expect(sessionData.profileId).toBe(profile!.id);
  });

  it('returns 401 for invalid Bearer tokens', async () => {
    const app = createTestApp();
    const response = await makeRequest(app, 'GET', '/protected', {
      headers: { Authorization: 'Bearer invalid' },
    });
    expect(response.status).toBe(401);
  });
});

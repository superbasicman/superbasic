import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.unmock('@repo/database');

import app from '../../../../app.js';
import { getTestPrisma, resetDatabase } from '../../../../test/setup.js';
import { createTestUser } from '../../../../test/helpers.js';
import { deriveCodeChallenge, generateCodeVerifier } from '@repo/auth-core';
import { issueAuthorizationCode } from '../../../../lib/oauth-authorization-codes.js';
import { authService } from '../../../../lib/auth-service.js';
import { parseOpaqueToken } from '@repo/auth';

function buildFormRequest(body: Record<string, string>): Request {
  const params = new URLSearchParams(body);
  return new Request('http://localhost/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
}

describe('POST /v1/oauth/token', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('exchanges a valid authorization code for tokens', async () => {
    const prisma = getTestPrisma();
    const { user } = await createTestUser();

    await prisma.oAuthClient.create({
      data: {
        clientId: 'mobile',
        name: 'Mobile',
        clientType: 'public',
        redirectUris: ['sb://callback'],
      },
    });

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = deriveCodeChallenge(codeVerifier, 'S256');

    const { code } = await issueAuthorizationCode({
      userId: user.id,
      clientId: 'mobile',
      redirectUri: 'sb://callback',
      codeChallenge,
      codeChallengeMethod: 'S256',
      scopes: ['read:profile'],
    });

    const response = await app.fetch(
      buildFormRequest({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'sb://callback',
        client_id: 'mobile',
        code_verifier: codeVerifier,
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.tokenType).toBe('Bearer');
    expect(typeof data.accessToken).toBe('string');
    expect(typeof data.refreshToken).toBe('string');

    const session = await prisma.authSession.findFirst({ where: { userId: user.id } });
    expect((session?.clientInfo as any)?.type).toBe('mobile');
  });

  it('rejects invalid PKCE verifier', async () => {
    const prisma = getTestPrisma();
    const { user } = await createTestUser();

    await prisma.oAuthClient.create({
      data: {
        clientId: 'mobile',
        name: 'Mobile',
        clientType: 'public',
        redirectUris: ['sb://callback'],
      },
    });

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = deriveCodeChallenge(codeVerifier, 'S256');

    const { code } = await issueAuthorizationCode({
      userId: user.id,
      clientId: 'mobile',
      redirectUri: 'sb://callback',
      codeChallenge,
      codeChallengeMethod: 'S256',
    });

    const response = await app.fetch(
      buildFormRequest({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'sb://callback',
        client_id: 'mobile',
        code_verifier: 'invalid-verifier',
      })
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('invalid_grant');
  });

  it('rotates refresh tokens via grant_type=refresh_token and revokes the old one', async () => {
    const prisma = getTestPrisma();
    const { user } = await createTestUser();

    await prisma.oAuthClient.create({
      data: {
        clientId: 'web-dashboard',
        name: 'Web Dashboard',
        clientType: 'public',
        redirectUris: ['http://localhost:5173/auth/callback'],
      },
    });

    const sessionWithRefresh = await authService.createSessionWithRefresh({
      userId: user.id,
      identity: {
        provider: 'oauth',
        providerUserId: 'web-dashboard',
        email: user.primaryEmail,
      },
      clientType: 'web',
      workspaceId: null,
      rememberMe: true,
      refreshFamilyId: 'family-1',
    });

    const response = await app.fetch(
      buildFormRequest({
        grant_type: 'refresh_token',
        client_id: 'web-dashboard',
        refresh_token: sessionWithRefresh.refresh.refreshToken,
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(typeof data.access_token).toBe('string');
    expect(typeof data.refresh_token).toBe('string');
    expect(data.refresh_token).not.toBe(sessionWithRefresh.refresh.refreshToken);

    const oldRecord = await prisma.refreshToken.findUnique({
      where: { id: sessionWithRefresh.refresh.token.id },
    });
    const parsedNew = parseOpaqueToken(data.refresh_token);
    const newRecord = await prisma.refreshToken.findUnique({
      where: { id: parsedNew?.tokenId ?? '' },
    });

    expect(oldRecord?.revokedAt).not.toBeNull();
    expect(newRecord?.familyId).toBe('family-1');
    expect(newRecord?.sessionId).toBe(sessionWithRefresh.session.sessionId);
  });

  it('rejects reuse of a revoked refresh token', async () => {
    const prisma = getTestPrisma();
    const { user } = await createTestUser();

    await prisma.oAuthClient.create({
      data: {
        clientId: 'web-dashboard',
        name: 'Web Dashboard',
        clientType: 'public',
        redirectUris: ['http://localhost:5173/auth/callback'],
      },
    });

    const sessionWithRefresh = await authService.createSessionWithRefresh({
      userId: user.id,
      identity: {
        provider: 'oauth',
        providerUserId: 'web-dashboard',
        email: user.primaryEmail,
      },
      clientType: 'web',
      workspaceId: null,
      rememberMe: true,
      refreshFamilyId: 'family-2',
    });

    // First refresh to rotate and revoke the original token
    const first = await app.fetch(
      buildFormRequest({
        grant_type: 'refresh_token',
        client_id: 'web-dashboard',
        refresh_token: sessionWithRefresh.refresh.refreshToken,
      })
    );
    expect(first.status).toBe(200);

    // Reuse the revoked token
    const reuse = await app.fetch(
      buildFormRequest({
        grant_type: 'refresh_token',
        client_id: 'web-dashboard',
        refresh_token: sessionWithRefresh.refresh.refreshToken,
      })
    );
    expect(reuse.status).toBe(401);
    const reuseBody = await reuse.json();
    expect(reuseBody.error).toBe('invalid_grant');

    const session = await prisma.authSession.findUnique({
      where: { id: sessionWithRefresh.session.sessionId },
    });
    expect(session?.revokedAt).not.toBeNull();
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.unmock('@repo/database');

import app from '../../../../app.js';
import { getTestPrisma, resetDatabase } from '../../../../test/setup.js';
import { createTestUser } from '../../../../test/helpers.js';
import { deriveCodeChallenge, generateCodeVerifier } from '@repo/auth-core';
import { issueAuthorizationCode } from '../../../../lib/oauth-authorization-codes.js';

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
        type: 'public',
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

    const session = await prisma.session.findFirst({ where: { userId: user.id } });
    expect(session?.clientType).toBe('mobile');
  });

  it('rejects invalid PKCE verifier', async () => {
    const prisma = getTestPrisma();
    const { user } = await createTestUser();

    await prisma.oAuthClient.create({
      data: {
        clientId: 'mobile',
        name: 'Mobile',
        type: 'public',
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
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseOpaqueToken, verifyTokenSecret } from '@repo/auth';

vi.unmock('@repo/database');

import app from '../../../../app.js';
import { resetDatabase, getTestPrisma } from '../../../../test/setup.js';
import {
  createSessionRecord,
  createTestUser,
  makeRequest,
} from '../../../../test/helpers.js';

describe('GET /v1/oauth/authorize', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('issues a PKCE authorization code and redirects with state', async () => {
    const prisma = getTestPrisma();
    const { user } = await createTestUser();
    const session = await createSessionRecord(user.id);

    await prisma.oAuthClient.create({
      data: {
        clientId: 'mobile',
        name: 'Mobile',
        clientType: 'public',
        redirectUris: ['sb://callback', 'http://localhost:3000/v1/auth/callback/mobile'],
      },
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: 'mobile',
      redirect_uri: 'sb://callback',
      code_challenge: 'challenge123',
      code_challenge_method: 'S256',
      scope: 'read:profile write:profile',
      state: 'abc123',
    });

    const response = await makeRequest(
      app,
      'GET',
      `/v1/oauth/authorize?${params.toString()}`,
      {
        headers: {
          Cookie: `authjs.session-token=${session.id}`,
        },
      }
    );

    expect(response.status).toBe(302);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();

    const redirectUrl = new URL(location!);
    expect(redirectUrl.toString().startsWith('sb://callback')).toBe(true);
    expect(redirectUrl.searchParams.get('state')).toBe('abc123');

    const code = redirectUrl.searchParams.get('code');
    expect(code).toBeTruthy();

    const parsed = parseOpaqueToken(code!);
    expect(parsed).not.toBeNull();

    const record = await prisma.oAuthAuthorizationCode.findUnique({
      where: { id: parsed!.tokenId },
    });

    expect(record).toBeTruthy();
    expect(record?.userId).toBe(user.id);
    expect(record?.clientId).toBe('mobile');
    expect(record?.redirectUri).toBe('sb://callback');
    expect(record?.codeChallenge).toBe('challenge123');
    expect(record?.codeChallengeMethod).toBe('S256');
    expect(record?.scopes).toEqual(['read:profile', 'write:profile']);
    expect(record?.consumedAt).toBeNull();
    expect(verifyTokenSecret(parsed!.tokenSecret, record!.codeHash as any)).toBe(true);
  });

  it('requires authentication', async () => {
    const prisma = getTestPrisma();

    await prisma.oAuthClient.create({
      data: {
        clientId: 'mobile',
        name: 'Mobile',
        clientType: 'public',
        redirectUris: ['sb://callback'],
      },
    });

    // Without a session cookie, should redirect to login page
    const response = await makeRequest(
      app,
      'GET',
      '/v1/oauth/authorize?response_type=code&client_id=mobile&redirect_uri=sb://callback&code_challenge=abc'
    );

    expect(response.status).toBe(302);
    const location = response.headers.get('location');
    expect(location).toContain('/login');
  });

  it('rejects redirects not allowed for the client', async () => {
    const prisma = getTestPrisma();
    const { user } = await createTestUser();
    const session = await createSessionRecord(user.id);

    await prisma.oAuthClient.create({
      data: {
        clientId: 'mobile',
        name: 'Mobile',
        clientType: 'public',
        redirectUris: ['sb://callback'],
      },
    });

    const response = await makeRequest(
      app,
      'GET',
      '/v1/oauth/authorize?response_type=code&client_id=mobile&redirect_uri=sb://not-allowed&code_challenge=abc',
      {
        headers: {
          Cookie: `authjs.session-token=${session.id}`,
        },
      }
    );

    // OAuth 2.1 redirects back with error when redirect_uri is in allowlist but request uses different one
    // Since 'sb://not-allowed' is not in the client's registered redirect URIs, it will error
    expect(response.status).toBe(302);
    const location = response.headers.get('location');
    expect(location).toContain('error=invalid_request');
  });
});

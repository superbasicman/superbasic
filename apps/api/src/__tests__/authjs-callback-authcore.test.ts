import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.unmock('@repo/database');

import { AUTHJS_GOOGLE_PROVIDER_ID, createOpaqueToken, createTokenHashEnvelope } from '@repo/auth';
import { resetDatabase, getTestPrisma } from '../test/setup.js';
import { maybeIssueAuthCoreSession } from '../auth.js';
import { REFRESH_CSRF_COOKIE, REFRESH_TOKEN_COOKIE } from '../routes/v1/auth/refresh-cookie.js';

const prisma = getTestPrisma;

describe('Auth.js callback → AuthCore session minting', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('mints AuthCore access/refresh and cookies from an Auth.js session cookie', async () => {
    const user = await prisma().user.create({
      data: {
        email: 'callback-test@example.com',
        emailLower: 'callback-test@example.com',
        password: 'hashed',
        status: 'active',
      },
    });

    const opaque = createOpaqueToken();
    await prisma().session.create({
      data: {
        userId: user.id,
        tokenId: opaque.tokenId,
        sessionTokenHash: createTokenHashEnvelope(opaque.tokenSecret),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        clientType: 'web',
        kind: 'default',
        lastUsedAt: new Date(),
      },
    });

    const headers = new Headers();
    headers.append('Set-Cookie', `authjs.session-token=${encodeURIComponent(opaque.value)}; Path=/; HttpOnly`);

    const request = new Request(
      `http://localhost/v1/auth/callback/${encodeURIComponent(AUTHJS_GOOGLE_PROVIDER_ID)}`,
      {
        headers: {
          'user-agent': 'vitest',
          'x-forwarded-for': '203.0.113.10',
        },
      }
    );

    await maybeIssueAuthCoreSession(request, headers);

    const setCookie = headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${REFRESH_TOKEN_COOKIE}=`);
    expect(setCookie).toContain(`${REFRESH_CSRF_COOKIE}=`);
    const accessToken = headers.get('x-access-token');
    expect(typeof accessToken).toBe('string');
    expect(accessToken && accessToken.length).toBeGreaterThan(10);

    const refreshTokenRow = await prisma().token.findFirst({
      where: { userId: user.id, type: 'refresh' },
    });
    expect(refreshTokenRow).not.toBeNull();
  });
});

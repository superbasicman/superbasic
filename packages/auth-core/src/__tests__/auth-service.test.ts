import { generateKeyPairSync } from 'node:crypto';
import type { PrismaClient } from '@repo/database';
import { exportJWK } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InactiveUserError } from '../errors.js';
import { AuthCoreService } from '../service.js';
import { type SigningKey, SigningKeyStore, signAccessToken } from '../signing.js';

const ISSUER = 'http://localhost:3000';
const AUDIENCE = `${ISSUER}/v1`;

describe('AuthCoreService.verifyRequest', () => {
  let signingKey: SigningKey;
  let keyStore: SigningKeyStore;
  type PrismaStub = {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    session: {
      findUnique: ReturnType<typeof vi.fn>;
    };
  };
  let prismaStub: PrismaStub;
  let setContextMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    signingKey = {
      kid: 'test-key',
      alg: 'EdDSA',
      privateKey,
      publicKey,
      jwk: await exportJWK(publicKey),
    };
    keyStore = new SigningKeyStore([signingKey], signingKey.kid);
    setContextMock = vi.fn().mockResolvedValue(undefined);
    prismaStub = {
      user: {
        findUnique: vi.fn(),
      },
      session: {
        findUnique: vi.fn(),
      },
    };
  });

  it('returns AuthContext for a valid token and session', async () => {
    const tokenResult = await signAccessToken(
      keyStore,
      { issuer: ISSUER, audience: AUDIENCE },
      { userId: 'user-123', sessionId: 'session-123' }
    );
    const service = new AuthCoreService({
      prisma: prismaStub as unknown as PrismaClient,
      keyStore,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: 0,
      setContext: setContextMock,
    });

    prismaStub.user.findUnique.mockResolvedValue({
      id: 'user-123',
      status: 'active',
      profile: { id: 'profile-123' },
    });
    prismaStub.session.findUnique.mockResolvedValue({
      id: 'session-123',
      userId: 'user-123',
      clientType: 'web',
      expiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() + 120_000),
      revokedAt: null,
      mfaLevel: 'none',
    });

    const context = await service.verifyRequest({
      authorizationHeader: `Bearer ${tokenResult.token}`,
      requestId: 'req-1',
    });

    expect(context).toMatchObject({
      userId: 'user-123',
      sessionId: 'session-123',
      profileId: 'profile-123',
      clientType: 'web',
      activeWorkspaceId: null,
      scopes: [],
      roles: [],
      requestId: 'req-1',
    });
    expect(setContextMock).toHaveBeenCalledWith(prismaStub, {
      userId: 'user-123',
      profileId: 'profile-123',
      workspaceId: null,
    });
  });

  it('throws when user is inactive', async () => {
    const tokenResult = await signAccessToken(
      keyStore,
      { issuer: ISSUER, audience: AUDIENCE },
      { userId: 'user-999' }
    );

    const service = new AuthCoreService({
      prisma: prismaStub as unknown as PrismaClient,
      keyStore,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: 0,
      setContext: setContextMock,
    });

    prismaStub.user.findUnique.mockResolvedValue({
      id: 'user-999',
      status: 'disabled',
      profile: null,
    });

    await expect(
      service.verifyRequest({
        authorizationHeader: `Bearer ${tokenResult.token}`,
      })
    ).rejects.toBeInstanceOf(InactiveUserError);
  });
});

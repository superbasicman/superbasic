import { generateKeyPairSync } from 'node:crypto';
import type { PrismaClient } from '@repo/database';
import { exportJWK } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError, InactiveUserError } from '../errors.js';
import { AuthCoreService } from '../service.js';
import { type SigningKey, SigningKeyStore, signAccessToken } from '../signing.js';

const ISSUER = 'http://localhost:3000';
const AUDIENCE = `${ISSUER}/v1`;
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

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
    workspaceMember: {
      findFirst: ReturnType<typeof vi.fn>;
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
      workspaceMember: {
        findFirst: vi.fn().mockResolvedValue(null),
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
      scopes: ['read:profile', 'write:profile'],
      roles: [],
      requestId: 'req-1',
    });
    expect(setContextMock).toHaveBeenCalledWith(prismaStub, {
      userId: 'user-123',
      profileId: 'profile-123',
      workspaceId: null,
    });
  });

  it('selects workspace from path parameter and populates roles/scopes', async () => {
    const tokenResult = await signAccessToken(
      keyStore,
      { issuer: ISSUER, audience: AUDIENCE },
      { userId: 'user-abc', sessionId: 'session-abc' }
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
      id: 'user-abc',
      status: 'active',
      profile: { id: 'profile-abc' },
    });
    prismaStub.session.findUnique.mockResolvedValue({
      id: 'session-abc',
      userId: 'user-abc',
      clientType: 'web',
      expiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() + 120_000),
      revokedAt: null,
      mfaLevel: 'none',
    });
    prismaStub.workspaceMember.findFirst.mockImplementation(
      async (args: { where?: { workspaceId?: string } }) => {
        if (args.where?.workspaceId === WORKSPACE_ID) {
          return { workspaceId: WORKSPACE_ID, role: 'owner' };
        }
        return null;
      }
    );

    const context = await service.verifyRequest({
      authorizationHeader: `Bearer ${tokenResult.token}`,
      workspacePathParam: WORKSPACE_ID,
    });

    expect(context).not.toBeNull();
    const resolved = context as Exclude<typeof context, null>;

    expect(resolved.activeWorkspaceId).toBe(WORKSPACE_ID);
    expect(resolved.roles).toEqual(['owner']);
    expect(resolved.scopes).toEqual(
      expect.arrayContaining(['admin', 'read:transactions', 'write:profile'])
    );
  });

  it('throws when workspace header references an unauthorized workspace', async () => {
    const tokenResult = await signAccessToken(
      keyStore,
      { issuer: ISSUER, audience: AUDIENCE },
      { userId: 'user-def', sessionId: 'session-def' }
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
      id: 'user-def',
      status: 'active',
      profile: { id: 'profile-def' },
    });
    prismaStub.session.findUnique.mockResolvedValue({
      id: 'session-def',
      userId: 'user-def',
      clientType: 'web',
      expiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() + 120_000),
      revokedAt: null,
      mfaLevel: 'none',
    });
    prismaStub.workspaceMember.findFirst.mockResolvedValue(null);

    await expect(
      service.verifyRequest({
        authorizationHeader: `Bearer ${tokenResult.token}`,
        workspaceHeader: OTHER_WORKSPACE_ID,
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('falls back to default membership when hinted workspace is unavailable', async () => {
    const tokenResult = await signAccessToken(
      keyStore,
      { issuer: ISSUER, audience: AUDIENCE },
      { userId: 'user-ghi', sessionId: 'session-ghi', workspaceId: OTHER_WORKSPACE_ID }
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
      id: 'user-ghi',
      status: 'active',
      profile: { id: 'profile-ghi' },
    });
    prismaStub.session.findUnique.mockResolvedValue({
      id: 'session-ghi',
      userId: 'user-ghi',
      clientType: 'web',
      expiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() + 120_000),
      revokedAt: null,
      mfaLevel: 'none',
    });
    prismaStub.workspaceMember.findFirst.mockImplementation(
      async (args: { where?: { workspaceId?: string }; orderBy?: unknown }) => {
        if (args.where?.workspaceId === OTHER_WORKSPACE_ID) {
          return null;
        }
        if (args.orderBy) {
          return { workspaceId: WORKSPACE_ID, role: 'admin' };
        }
        return null;
      }
    );

    const context = await service.verifyRequest({
      authorizationHeader: `Bearer ${tokenResult.token}`,
    });

    expect(context).not.toBeNull();
    const resolved = context as Exclude<typeof context, null>;

    expect(resolved.activeWorkspaceId).toBe(WORKSPACE_ID);
    expect(resolved.roles).toEqual(['admin']);
    expect(resolved.scopes).toEqual(
      expect.arrayContaining(['write:workspaces', 'write:accounts', 'read:profile'])
    );
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

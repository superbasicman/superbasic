import { generateKeyPairSync } from 'node:crypto';
import type { PrismaClient } from '@repo/database';
import { exportJWK } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '../errors.js';
import { AuthCoreService } from '../service.js';
import { type SigningKey, SigningKeyStore, signAccessToken } from '../signing.js';

const ISSUER = 'http://localhost:3000';
const AUDIENCE = `${ISSUER}/v1`;
const WORKSPACE_ID_1 = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID_2 = '22222222-2222-4222-8222-222222222222';

describe('AuthCoreService.resolveWorkspaceContext', () => {
  type PrismaStub = {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    authSession: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    workspaceMember: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let signingKey: SigningKey;
  let keyStore: SigningKeyStore;
  let prismaStub: PrismaStub;
  let setContextMock: ReturnType<typeof vi.fn>;
  let service: AuthCoreService;

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
      authSession: {
        findUnique: vi.fn(),
      },
      workspaceMember: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    };

    service = new AuthCoreService({
      prisma: prismaStub as unknown as PrismaClient,
      keyStore,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: 0,
      setContext: setContextMock,
    });

    // Default user setup
    prismaStub.user.findUnique.mockResolvedValue({
      id: 'user-123',
      userState: 'active',
      profile: { id: 'profile-123' },
    });

    // Default session setup
    prismaStub.authSession.findUnique.mockResolvedValue({
      id: 'session-123',
      userId: 'user-123',
      clientInfo: { type: 'web' },
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      mfaLevel: 'none',
    });
  });

  const createToken = async () => {
    const { token } = await signAccessToken(
      keyStore,
      { issuer: ISSUER, audience: AUDIENCE },
      { userId: 'user-123', sessionId: 'session-123' }
    );
    return token;
  };

  it('should return null workspace when user has no memberships', async () => {
    prismaStub.workspaceMember.findMany.mockResolvedValue([]);
    prismaStub.workspaceMember.findFirst.mockResolvedValue(null);

    const token = await createToken();
    const context = await service.verifyRequest({
      authorizationHeader: `Bearer ${token}`,
    });

    expect(context?.activeWorkspaceId).toBeNull();
    expect(context?.allowedWorkspaces).toEqual([]);
  });

  it('should auto-select workspace when user has exactly one membership', async () => {
    prismaStub.workspaceMember.findMany.mockResolvedValue([
      { workspaceId: WORKSPACE_ID_1, role: 'owner' },
    ]);
    prismaStub.workspaceMember.findFirst.mockResolvedValue({
      workspaceId: WORKSPACE_ID_1,
      role: 'owner',
    });

    const token = await createToken();
    const context = await service.verifyRequest({
      authorizationHeader: `Bearer ${token}`,
    });

    expect(context?.activeWorkspaceId).toBe(WORKSPACE_ID_1);
    expect(context?.allowedWorkspaces).toEqual([WORKSPACE_ID_1]);
  });

  it('should throw AuthorizationError when user has multiple workspaces and no header', async () => {
    prismaStub.workspaceMember.findMany.mockResolvedValue([
      { workspaceId: WORKSPACE_ID_1, role: 'owner' },
      { workspaceId: WORKSPACE_ID_2, role: 'member' },
    ]);
    prismaStub.workspaceMember.findFirst.mockResolvedValue(null);

    const token = await createToken();

    await expect(
      service.verifyRequest({
        authorizationHeader: `Bearer ${token}`,
      })
    ).rejects.toThrow(AuthorizationError);
  });

  it('should succeed when user has multiple workspaces and provides valid header', async () => {
    prismaStub.workspaceMember.findMany.mockResolvedValue([
      { workspaceId: WORKSPACE_ID_1, role: 'owner' },
      { workspaceId: WORKSPACE_ID_2, role: 'member' },
    ]);

    prismaStub.workspaceMember.findFirst.mockImplementation(
      async ({ where }: { where?: { workspaceId?: string } }) => {
        if (where?.workspaceId === WORKSPACE_ID_2) {
          return { workspaceId: WORKSPACE_ID_2, role: 'member' };
        }
        return null;
      }
    );

    const token = await createToken();
    const context = await service.verifyRequest({
      authorizationHeader: `Bearer ${token}`,
      workspaceHeader: WORKSPACE_ID_2,
    });

    expect(context?.activeWorkspaceId).toBe(WORKSPACE_ID_2);
    expect(context?.roles).toContain('member');
  });

  it('should fail when user provides invalid workspace header', async () => {
    prismaStub.workspaceMember.findFirst.mockResolvedValue(null);

    const token = await createToken();

    await expect(
      service.verifyRequest({
        authorizationHeader: `Bearer ${token}`,
        workspaceHeader: 'invalid-uuid',
      })
    ).rejects.toThrow(AuthorizationError);
  });
});

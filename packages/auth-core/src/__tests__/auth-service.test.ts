import { generateKeyPairSync } from 'node:crypto';
import * as authLib from '@repo/auth';
import type { ApiKey, PrismaClient } from '@repo/database';
import { SignJWT, exportJWK } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError, InactiveUserError, UnauthorizedError } from '../errors.js';
import { AuthCoreService } from '../service.js';
import { type SigningKey, SigningKeyStore, signAccessToken } from '../signing.js';
import type { TokenHashEnvelope } from '../types.js';

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
    authSession: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    workspaceMember: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    apiKey: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
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
      authSession: {
        findUnique: vi.fn(),
      },
      workspaceMember: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      apiKey: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
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
      userState: 'active',
      profile: { id: 'profile-123' },
    });
    prismaStub.authSession.findUnique.mockResolvedValue({
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
      mfaLevel: 'none',
    });
    expect(setContextMock).toHaveBeenCalledWith(prismaStub, {
      userId: 'user-123',
      profileId: 'profile-123',
      workspaceId: null,
      mfaLevel: 'none',
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
      userState: 'active',
      profile: { id: 'profile-abc' },
    });
    prismaStub.authSession.findUnique.mockResolvedValue({
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
      userState: 'active',
      profile: { id: 'profile-def' },
    });
    prismaStub.authSession.findUnique.mockResolvedValue({
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
      userState: 'active',
      profile: { id: 'profile-ghi' },
    });
    prismaStub.authSession.findUnique.mockResolvedValue({
      id: 'session-ghi',
      userId: 'user-ghi',
      clientType: 'web',
      expiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() + 120_000),
      revokedAt: null,
      mfaLevel: 'none',
    });
    prismaStub.workspaceMember.findFirst.mockResolvedValue(null);
    prismaStub.workspaceMember.findMany.mockResolvedValue([
      { workspaceId: WORKSPACE_ID, role: 'admin' },
      { workspaceId: OTHER_WORKSPACE_ID, role: 'viewer' },
    ]);

    await expect(
      service.verifyRequest({
        authorizationHeader: `Bearer ${tokenResult.token}`,
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('accepts tokens signed with a rotated-but-published key', async () => {
    const { privateKey: oldPrivateKey, publicKey: oldPublicKey } = generateKeyPairSync('ed25519');
    const { privateKey: newPrivateKey, publicKey: newPublicKey } = generateKeyPairSync('ed25519');

    const rotatedKeyStore = new SigningKeyStore(
      [
        {
          kid: 'new-key',
          alg: 'EdDSA',
          privateKey: newPrivateKey,
          publicKey: newPublicKey,
          jwk: await exportJWK(newPublicKey),
        },
        {
          kid: 'old-key',
          alg: 'EdDSA',
          privateKey: null,
          publicKey: oldPublicKey,
          jwk: await exportJWK(oldPublicKey),
        },
      ],
      'new-key'
    );

    const token = await new SignJWT({
      sub: 'user-rotated',
      sid: 'session-rotated',
      token_use: 'access',
      client_type: 'web',
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'old-key', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .sign(oldPrivateKey);

    prismaStub.user.findUnique.mockResolvedValue({
      id: 'user-rotated',
      userState: 'active',
      profile: { id: 'profile-rotated' },
    });
    prismaStub.authSession.findUnique.mockResolvedValue({
      id: 'session-rotated',
      userId: 'user-rotated',
      clientType: 'web',
      expiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() + 120_000),
      revokedAt: null,
      mfaLevel: 'none',
    });

    const service = new AuthCoreService({
      prisma: prismaStub as unknown as PrismaClient,
      keyStore: rotatedKeyStore,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: 0,
      setContext: setContextMock,
    });

    const context = await service.verifyRequest({
      authorizationHeader: `Bearer ${token}`,
    });

    expect(context?.sessionId).toBe('session-rotated');
    expect(context?.userId).toBe('user-rotated');
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
      userState: 'disabled',
      profile: null,
    });

    await expect(
      service.verifyRequest({
        authorizationHeader: `Bearer ${tokenResult.token}`,
      })
    ).rejects.toBeInstanceOf(InactiveUserError);
  });

  it('verifies service access tokens without user lookup', async () => {
    const { token } = await signAccessToken(
      keyStore,
      { issuer: ISSUER, audience: AUDIENCE },
      {
        userId: 'svc-123',
        principalType: 'service',
        clientId: 'client-1',
        workspaceId: WORKSPACE_ID,
        allowedWorkspaces: [WORKSPACE_ID],
        scopes: ['read:profile'],
        clientType: 'partner',
      }
    );

    const service = new AuthCoreService({
      prisma: {
        workspaceMember: { findMany: vi.fn(), findFirst: vi.fn() },
      } as unknown as PrismaClient,
      keyStore,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: 0,
      setContext: setContextMock,
    });

    const context = await service.verifyRequest({
      authorizationHeader: `Bearer ${token}`,
    });

    expect(context).toMatchObject({
      principalType: 'service',
      serviceId: 'svc-123',
      clientId: 'client-1',
      activeWorkspaceId: WORKSPACE_ID,
      allowedWorkspaces: [WORKSPACE_ID],
      scopes: ['read:profile'],
    });
    expect(setContextMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: null,
        profileId: null,
        workspaceId: WORKSPACE_ID,
      })
    );
  });
});

describe('AuthCoreService PAT issuance and revocation', () => {
  const ISSUER = 'http://localhost:3000';
  const AUDIENCE = `${ISSUER}/v1`;
  let keyStore: SigningKeyStore;
  let prismaStub: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    apiKey: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    keyStore = new SigningKeyStore(
      [
        {
          kid: 'test-key',
          alg: 'EdDSA',
          privateKey,
          publicKey,
          jwk: await exportJWK(publicKey),
        },
      ],
      'test-key'
    );

    prismaStub = {
      user: {
        findUnique: vi.fn(),
      },
      apiKey: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('issues a personal access token with hashed secret and expiry', async () => {
    const hashEnvelope = {
      algo: 'hmac-sha256',
      keyId: 'v1',
      hash: 'hashed-secret',
      issuedAt: '2025-01-01T00:00:00.000Z',
    } satisfies TokenHashEnvelope;

    vi.spyOn(authLib, 'createOpaqueToken').mockReturnValue({
      tokenId: 'pat_token',
      tokenSecret: 'secret-abc',
      value: 'sbf_pat_token.secret-abc',
    });
    vi.spyOn(authLib, 'createTokenHashEnvelope').mockReturnValue(hashEnvelope);

    const expiresAt = new Date('2025-04-01T00:00:00.000Z');
    const createdApiKey: ApiKey = {
      id: 'pat_token',
      userId: 'user-123',
      workspaceId: 'workspace-1',
      keyHash: hashEnvelope,
      scopes: ['read:transactions'],
      name: 'CLI token',
      last4: 't-abc',
      lastUsedAt: null,
      expiresAt,
      revokedAt: null,
      createdAt: new Date('2025-03-01T00:00:00.000Z'),
      updatedAt: new Date('2025-03-01T00:00:00.000Z'),
      // ApiKey schema fields
      issuedAt: new Date('2025-03-01T00:00:00.000Z'),
      createdByIp: null,
      lastUsedIp: null,
      userAgent: null,
      metadata: null,
    };

    prismaStub.apiKey.create.mockResolvedValue(createdApiKey);
    prismaStub.user.findUnique.mockResolvedValue({
      id: 'user-123',
      userState: 'active',
      profile: { id: 'profile-1' },
    });

    const service = new AuthCoreService({
      prisma: prismaStub as unknown as PrismaClient,
      keyStore,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: 0,
    });

    const issued = await service.issuePersonalAccessToken({
      userId: 'user-123',
      workspaceId: 'workspace-1',
      scopes: ['read:transactions'],
      name: 'CLI token',
      expiresAt,
    });

    expect(prismaStub.apiKey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'pat_token',
        userId: 'user-123',
        workspaceId: 'workspace-1',
        keyHash: hashEnvelope,
        scopes: ['read:transactions'],
        name: 'CLI token',
        expiresAt,
        revokedAt: null,
        last4: expect.any(String),
      }),
    });

    expect(issued).toEqual({
      tokenId: 'pat_token',
      secret: 'sbf_pat_token.secret-abc',
      type: 'personal_access',
      scopes: ['read:transactions'],
      name: 'CLI token',
      workspaceId: 'workspace-1',
      expiresAt,
    });
  });

  it('rejects invalid expiry', async () => {
    vi.spyOn(authLib, 'createOpaqueToken').mockReturnValue({
      tokenId: 'pat_token',
      tokenSecret: 'secret-abc',
      value: 'sbf_pat_token.secret-abc',
    });
    vi.spyOn(authLib, 'createTokenHashEnvelope').mockReturnValue({
      algo: 'hmac-sha256',
      keyId: 'v1',
      hash: 'hashed',
      issuedAt: '2025-01-01T00:00:00.000Z',
    } satisfies TokenHashEnvelope);

    const service = new AuthCoreService({
      prisma: prismaStub as unknown as PrismaClient,
      keyStore,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: 0,
    });

    await expect(
      service.issuePersonalAccessToken({
        userId: 'user-123',
        scopes: ['read:profile'],
        name: 'Bad expiry',
        expiresAt: new Date('invalid'),
      })
    ).rejects.toThrow('expiresAt must be a valid Date instance');
    expect(prismaStub.apiKey.create).not.toHaveBeenCalled();
  });

  it('revokes a token and records revocation metadata', async () => {
    const now = new Date('2025-05-01T00:00:00.000Z');
    vi.useFakeTimers({ now });

    prismaStub.apiKey.findUnique.mockResolvedValue({
      id: 'tok_pat',
      revokedAt: null,
    });

    prismaStub.apiKey.update.mockResolvedValue({});

    const service = new AuthCoreService({
      prisma: prismaStub as unknown as PrismaClient,
      keyStore,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: 0,
    });

    await service.revokeToken({
      tokenId: 'tok_pat',
      reason: 'compromised',
      revokedBy: 'admin-1',
    });

    expect(prismaStub.apiKey.update).toHaveBeenCalledTimes(1);
    const updateArg = prismaStub.apiKey.update.mock.calls[0]?.[0];
    const revokedAt = updateArg?.data.revokedAt;

    expect(updateArg).toMatchObject({
      where: { id: 'tok_pat' },
    });
    expect(revokedAt).toBeInstanceOf(Date);
  });

  it('is idempotent when token already revoked', async () => {
    prismaStub.apiKey.findUnique.mockResolvedValue({
      id: 'tok_pat',
      revokedAt: new Date('2025-04-01T00:00:00.000Z'),
      metadata: null,
    });

    const service = new AuthCoreService({
      prisma: prismaStub as unknown as PrismaClient,
      keyStore,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: 0,
    });

    await service.revokeToken({ tokenId: 'tok_pat' });
    expect(prismaStub.apiKey.update).not.toHaveBeenCalled();
  });

  it('throws when token is missing', async () => {
    prismaStub.apiKey.findUnique.mockResolvedValue(null);

    const service = new AuthCoreService({
      prisma: prismaStub as unknown as PrismaClient,
      keyStore,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: 0,
    });

    await expect(service.revokeToken({ tokenId: 'missing' })).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });
});

describe('AuthCoreService.verifyRequest with PATs', () => {
  const ISSUER = 'http://localhost:3000';
  const AUDIENCE = `${ISSUER}/v1`;
  const PAT_ID = '11111111-1111-4111-8111-111111111111';
  const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

  let keyStore: SigningKeyStore;
  let prismaStub: {
    apiKey: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    workspaceMember: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let setContextMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    keyStore = new SigningKeyStore(
      [
        {
          kid: 'test-key',
          alg: 'EdDSA',
          privateKey,
          publicKey,
          jwk: await exportJWK(publicKey),
        },
      ],
      'test-key'
    );

    prismaStub = {
      apiKey: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      workspaceMember: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    setContextMock = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns AuthContext for a valid PAT and intersects scopes with workspace role', async () => {
    vi.spyOn(authLib, 'verifyTokenSecret').mockReturnValue(true);

    prismaStub.apiKey.findUnique.mockResolvedValue({
      id: PAT_ID,
      userId: 'user-pat',
      keyHash: {
        algo: 'hmac-sha256',
        keyId: 'v1',
        hash: 'hashed',
        issuedAt: '2025-01-01T00:00:00.000Z',
      },
      scopes: ['read:transactions', 'write:accounts'],
      name: 'cli',
      workspaceId: WORKSPACE_ID,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: {
        id: 'user-pat',
        userState: 'active',
        profile: { id: 'profile-1' },
      },
    });

    prismaStub.workspaceMember.findFirst.mockImplementation(
      async (args: { where?: { workspaceId?: string } }) => {
        if (args.where?.workspaceId === WORKSPACE_ID) {
          return { workspaceId: WORKSPACE_ID, role: 'owner' };
        }
        return null;
      }
    );

    const service = new AuthCoreService({
      prisma: prismaStub as unknown as PrismaClient,
      keyStore,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: 0,
      setContext: setContextMock,
    });

    const auth = await service.verifyRequest({
      authorizationHeader: `Bearer sbf_${PAT_ID}.secret-abc`,
      requestId: 'req-123',
    });

    expect(auth).not.toBeNull();
    expect(auth?.sessionId).toBeNull();
    expect(auth?.userId).toBe('user-pat');
    expect(auth?.activeWorkspaceId).toBe(WORKSPACE_ID);
    expect(auth?.clientType).toBe('cli');
    expect(auth?.roles).toEqual(['owner']);
    expect(auth?.scopes).toEqual(expect.arrayContaining(['read:transactions', 'write:accounts']));
    expect(auth?.requestId).toBe('req-123');
    expect(setContextMock).toHaveBeenCalledWith(
      prismaStub,
      expect.objectContaining({
        userId: 'user-pat',
        profileId: 'profile-1',
        workspaceId: WORKSPACE_ID,
      })
    );
  });

  it('throws when PAT is revoked', async () => {
    vi.spyOn(authLib, 'verifyTokenSecret').mockReturnValue(true);

    prismaStub.apiKey.findUnique.mockResolvedValue({
      id: PAT_ID,
      userId: 'user-pat',
      keyHash: {
        algo: 'hmac-sha256',
        keyId: 'v1',
        hash: 'hashed',
        issuedAt: '2025-01-01T00:00:00.000Z',
      },
      scopes: [],
      name: 'cli',
      workspaceId: null,
      expiresAt: null,
      revokedAt: new Date(),
      user: {
        id: 'user-pat',
        userState: 'active',
        profile: { id: 'profile-1' },
      },
    });

    const service = new AuthCoreService({
      prisma: prismaStub as unknown as PrismaClient,
      keyStore,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: 0,
      setContext: setContextMock,
    });

    await expect(
      service.verifyRequest({
        authorizationHeader: `Bearer sbf_${PAT_ID}.secret-abc`,
      })
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('intersects PAT scopes with workspace membership scopes', async () => {
    vi.spyOn(authLib, 'verifyTokenSecret').mockReturnValue(true);

    prismaStub.apiKey.findUnique.mockResolvedValue({
      id: PAT_ID,
      userId: 'user-pat',
      keyHash: {
        algo: 'hmac-sha256',
        keyId: 'v1',
        hash: 'hashed',
        issuedAt: '2025-01-01T00:00:00.000Z',
      },
      scopes: ['read:profile', 'write:accounts'],
      name: 'cli',
      workspaceId: WORKSPACE_ID,
      expiresAt: null,
      revokedAt: null,
      user: {
        id: 'user-pat',
        userState: 'active',
        profile: { id: 'profile-1' },
      },
    });

    prismaStub.workspaceMember.findFirst.mockResolvedValue({
      workspaceId: WORKSPACE_ID,
      role: 'viewer',
    });

    const service = new AuthCoreService({
      prisma: prismaStub as unknown as PrismaClient,
      keyStore,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: 0,
      setContext: setContextMock,
    });

    const auth = await service.verifyRequest({
      authorizationHeader: `Bearer sbf_${PAT_ID}.secret-abc`,
    });

    expect(auth?.scopes).toEqual(['read:profile']);
  });

  it('does not grant PAT scopes outside the workspace intersection or requested set', async () => {
    vi.spyOn(authLib, 'verifyTokenSecret').mockReturnValue(true);

    prismaStub.apiKey.findUnique.mockResolvedValue({
      id: PAT_ID,
      userId: 'user-pat',
      keyHash: {
        algo: 'hmac-sha256',
        keyId: 'v1',
        hash: 'hashed',
        issuedAt: '2025-01-01T00:00:00.000Z',
      },
      scopes: ['admin'],
      name: 'cli',
      workspaceId: WORKSPACE_ID,
      expiresAt: null,
      revokedAt: null,
      user: {
        id: 'user-pat',
        userState: 'active',
        profile: { id: 'profile-1' },
      },
    });

    prismaStub.workspaceMember.findFirst.mockResolvedValue({
      workspaceId: WORKSPACE_ID,
      role: 'viewer',
    });

    const service = new AuthCoreService({
      prisma: prismaStub as unknown as PrismaClient,
      keyStore,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: 0,
      setContext: setContextMock,
    });

    const auth = await service.verifyRequest({
      authorizationHeader: `Bearer sbf_${PAT_ID}.secret-abc`,
    });

    expect(auth?.scopes).toEqual([]);
  });
});

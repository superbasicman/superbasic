import { generateKeyPairSync } from 'node:crypto';
import * as authLib from '@repo/auth';
import type { PrismaClient } from '@repo/database';
import { SignJWT, exportJWK } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError, InactiveUserError, UnauthorizedError } from '../errors.js';
import type {
  ApiKeyRepository,
  AuthProfileRepository,
  AuthSessionRepository,
  AuthUserRepository,
  WorkspaceMembershipRepository,
} from '../interfaces.js';
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

  // Mocks
  const mockUserRepo = { findById: vi.fn() } as unknown as AuthUserRepository;
  const mockSessionRepo = { findById: vi.fn() } as unknown as AuthSessionRepository;
  const mockMembershipRepo = {
    findManyByUserId: vi.fn(),
    findFirst: vi.fn(),
  } as unknown as WorkspaceMembershipRepository;
  const mockApiKeyRepo = {
    findById: vi.fn(),
    create: vi.fn(),
    revoke: vi.fn(),
  } as unknown as ApiKeyRepository;
  const mockProfileRepo = { ensureExists: vi.fn() } as unknown as AuthProfileRepository;

  let setContextMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetAllMocks();

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
  });

  it('returns AuthContext for a valid token and session', async () => {
    const tokenResult = await signAccessToken(
      keyStore,
      { issuer: ISSUER, audience: AUDIENCE },
      { userId: 'user-123', sessionId: 'session-123' }
    );
    const service = new AuthCoreService({
      prisma: {} as unknown as PrismaClient,
      userRepo: mockUserRepo,
      sessionRepo: mockSessionRepo,
      membershipRepo: mockMembershipRepo,
      apiKeyRepo: mockApiKeyRepo,
      profileRepo: mockProfileRepo,
      keyStore,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: 0,
      setContext: setContextMock,
    });

    vi.mocked(mockUserRepo.findById).mockResolvedValue({
      id: 'user-123',
      userState: 'active',
      primaryEmail: 'user@example.com',
      profileId: 'profile-123',
    });
    vi.mocked(mockSessionRepo.findById).mockResolvedValue({
      id: 'session-123',
      userId: 'user-123',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      mfaLevel: 'none',
      clientInfo: { type: 'web' },
    });
    vi.mocked(mockMembershipRepo.findManyByUserId).mockResolvedValue([]);

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
    expect(setContextMock).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-123',
      profileId: 'profile-123',
      workspaceId: null,
      mfaLevel: 'none',
      serviceId: null,
    });
  });

  it('selects workspace from path parameter and populates roles/scopes', async () => {
    const tokenResult = await signAccessToken(
      keyStore,
      { issuer: ISSUER, audience: AUDIENCE },
      { userId: 'user-abc', sessionId: 'session-abc' }
    );
    const service = new AuthCoreService({
      prisma: {} as unknown as PrismaClient,
      userRepo: mockUserRepo,
      sessionRepo: mockSessionRepo,
      membershipRepo: mockMembershipRepo,
      apiKeyRepo: mockApiKeyRepo,
      profileRepo: mockProfileRepo,
      keyStore,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: 0,
      setContext: setContextMock,
    });

    vi.mocked(mockUserRepo.findById).mockResolvedValue({
      id: 'user-abc',
      userState: 'active',
      primaryEmail: 'user@example.com',
      profileId: 'profile-abc',
    });
    vi.mocked(mockSessionRepo.findById).mockResolvedValue({
      id: 'session-abc',
      userId: 'user-abc',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      mfaLevel: 'none',
      clientInfo: { type: 'web' },
    });
    vi.mocked(mockMembershipRepo.findManyByUserId).mockResolvedValue([
      { workspaceId: WORKSPACE_ID, role: 'owner' },
    ]);
    vi.mocked(mockMembershipRepo.findFirst).mockImplementation(
      async (_userId: string, workspaceId: string) => {
        if (workspaceId === WORKSPACE_ID) {
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
      prisma: {} as unknown as PrismaClient,
      userRepo: mockUserRepo,
      sessionRepo: mockSessionRepo,
      membershipRepo: mockMembershipRepo,
      apiKeyRepo: mockApiKeyRepo,
      profileRepo: mockProfileRepo,
      keyStore,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: 0,
      setContext: setContextMock,
    });

    vi.mocked(mockUserRepo.findById).mockResolvedValue({
      id: 'user-def',
      userState: 'active',
      primaryEmail: 'user@example.com',
      profileId: 'profile-def',
    });
    vi.mocked(mockSessionRepo.findById).mockResolvedValue({
      id: 'session-def',
      userId: 'user-def',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      mfaLevel: 'none',
      clientInfo: { type: 'web' },
    });
    vi.mocked(mockMembershipRepo.findManyByUserId).mockResolvedValue([]);
    vi.mocked(mockMembershipRepo.findFirst).mockResolvedValue(null);

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
      prisma: {} as unknown as PrismaClient,
      userRepo: mockUserRepo,
      sessionRepo: mockSessionRepo,
      membershipRepo: mockMembershipRepo,
      apiKeyRepo: mockApiKeyRepo,
      profileRepo: mockProfileRepo,
      keyStore,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: 0,
      setContext: setContextMock,
    });

    vi.mocked(mockUserRepo.findById).mockResolvedValue({
      id: 'user-ghi',
      userState: 'active',
      primaryEmail: 'user@example.com',
      profileId: 'profile-ghi',
    });
    vi.mocked(mockSessionRepo.findById).mockResolvedValue({
      id: 'session-ghi',
      userId: 'user-ghi',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      mfaLevel: 'none',
      clientInfo: { type: 'web' },
    });
    vi.mocked(mockMembershipRepo.findFirst).mockResolvedValue(null);
    vi.mocked(mockMembershipRepo.findManyByUserId).mockResolvedValue([
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

    vi.mocked(mockUserRepo.findById).mockResolvedValue({
      id: 'user-rotated',
      userState: 'active',
      primaryEmail: 'user@example.com',
      profileId: 'profile-rotated',
    });
    vi.mocked(mockSessionRepo.findById).mockResolvedValue({
      id: 'session-rotated',
      userId: 'user-rotated',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      mfaLevel: 'none',
      clientInfo: { type: 'web' },
    });
    vi.mocked(mockMembershipRepo.findManyByUserId).mockResolvedValue([]);

    const service = new AuthCoreService({
      prisma: {} as unknown as PrismaClient,
      userRepo: mockUserRepo,
      sessionRepo: mockSessionRepo,
      membershipRepo: mockMembershipRepo,
      apiKeyRepo: mockApiKeyRepo,
      profileRepo: mockProfileRepo,
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
      prisma: {} as unknown as PrismaClient,
      userRepo: mockUserRepo,
      sessionRepo: mockSessionRepo,
      membershipRepo: mockMembershipRepo,
      apiKeyRepo: mockApiKeyRepo,
      profileRepo: mockProfileRepo,
      keyStore,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: 0,
      setContext: setContextMock,
    });

    vi.mocked(mockUserRepo.findById).mockResolvedValue({
      id: 'user-999',
      userState: 'disabled',
      primaryEmail: 'user@example.com',
      profileId: null,
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
      prisma: {} as unknown as PrismaClient,
      userRepo: mockUserRepo,
      sessionRepo: mockSessionRepo,
      membershipRepo: mockMembershipRepo,
      apiKeyRepo: mockApiKeyRepo,
      profileRepo: mockProfileRepo,
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

  // Mocks
  const mockUserRepo = { findById: vi.fn() } as unknown as AuthUserRepository;
  const mockSessionRepo = { findById: vi.fn() } as unknown as AuthSessionRepository;
  const mockMembershipRepo = {
    findManyByUserId: vi.fn(),
    findFirst: vi.fn(),
  } as unknown as WorkspaceMembershipRepository;
  const mockApiKeyRepo = {
    findById: vi.fn(),
    create: vi.fn(),
    revoke: vi.fn(),
  } as unknown as ApiKeyRepository;
  const mockProfileRepo = { ensureExists: vi.fn() } as unknown as AuthProfileRepository;

  beforeEach(async () => {
    vi.resetAllMocks();

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

    vi.mocked(mockApiKeyRepo.create).mockResolvedValue({
      id: 'pat_token',
      userId: 'user-123',
      scopes: ['read:transactions'],
      name: 'CLI token',
      workspaceId: 'workspace-1',
      expiresAt,
    });

    vi.mocked(mockUserRepo.findById).mockResolvedValue({
      id: 'user-123',
      userState: 'active',
      primaryEmail: 'user@example.com',
      profileId: 'profile-1',
    });

    const service = new AuthCoreService({
      prisma: {} as unknown as PrismaClient,
      userRepo: mockUserRepo,
      sessionRepo: mockSessionRepo,
      membershipRepo: mockMembershipRepo,
      apiKeyRepo: mockApiKeyRepo,
      profileRepo: mockProfileRepo,
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

    expect(mockApiKeyRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'pat_token',
        userId: 'user-123',
        workspaceId: 'workspace-1',
        keyHash: hashEnvelope,
        scopes: ['read:transactions'],
        name: 'CLI token',
        expiresAt,
        last4: expect.any(String),
      })
    );

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
      prisma: {} as unknown as PrismaClient,
      userRepo: mockUserRepo,
      sessionRepo: mockSessionRepo,
      membershipRepo: mockMembershipRepo,
      apiKeyRepo: mockApiKeyRepo,
      profileRepo: mockProfileRepo,
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
    expect(mockApiKeyRepo.create).not.toHaveBeenCalled();
  });

  it('revokes a token and records revocation metadata', async () => {
    const now = new Date('2025-05-01T00:00:00.000Z');
    vi.useFakeTimers({ now });

    vi.mocked(mockApiKeyRepo.findById).mockResolvedValue({
      id: 'tok_pat',
      userId: 'user-123',
      keyHash: {
        algo: 'hmac-sha256',
        keyId: 'test',
        hash: 'hashed',
        issuedAt: new Date().toISOString(),
      },
      scopes: [],
      name: 'cli',
      workspaceId: null,
      expiresAt: new Date(),
      revokedAt: null,
      createdAt: new Date(),
      user: { id: 'user-123', userState: 'active' },
    });

    vi.mocked(mockApiKeyRepo.revoke).mockResolvedValue(undefined);

    const service = new AuthCoreService({
      prisma: {} as unknown as PrismaClient,
      userRepo: mockUserRepo,
      sessionRepo: mockSessionRepo,
      membershipRepo: mockMembershipRepo,
      apiKeyRepo: mockApiKeyRepo,
      profileRepo: mockProfileRepo,
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

    expect(mockApiKeyRepo.revoke).toHaveBeenCalledWith('tok_pat');
  });

  it('is idempotent when token already revoked', async () => {
    vi.mocked(mockApiKeyRepo.findById).mockResolvedValue({
      id: 'tok_pat',
      userId: 'user-123',
      keyHash: {
        algo: 'hmac-sha256',
        keyId: 'test',
        hash: 'hashed',
        issuedAt: new Date().toISOString(),
      },
      scopes: [],
      name: 'cli',
      workspaceId: null,
      expiresAt: new Date(),
      revokedAt: new Date('2025-04-01T00:00:00.000Z'),
      createdAt: new Date(),
      user: { id: 'user-123', userState: 'active' },
    });

    const service = new AuthCoreService({
      prisma: {} as unknown as PrismaClient,
      userRepo: mockUserRepo,
      sessionRepo: mockSessionRepo,
      membershipRepo: mockMembershipRepo,
      apiKeyRepo: mockApiKeyRepo,
      profileRepo: mockProfileRepo,
      keyStore,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: 0,
    });

    await service.revokeToken({ tokenId: 'tok_pat' });
    expect(mockApiKeyRepo.revoke).not.toHaveBeenCalled();
  });

  it('throws when token is missing', async () => {
    vi.mocked(mockApiKeyRepo.findById).mockResolvedValue(null);

    const service = new AuthCoreService({
      prisma: {} as unknown as PrismaClient,
      userRepo: mockUserRepo,
      sessionRepo: mockSessionRepo,
      membershipRepo: mockMembershipRepo,
      apiKeyRepo: mockApiKeyRepo,
      profileRepo: mockProfileRepo,
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

  // Mocks
  const mockUserRepo = { findById: vi.fn() } as unknown as AuthUserRepository;
  const mockSessionRepo = { findById: vi.fn() } as unknown as AuthSessionRepository;
  const mockMembershipRepo = {
    findManyByUserId: vi.fn(),
    findFirst: vi.fn(),
  } as unknown as WorkspaceMembershipRepository;
  const mockApiKeyRepo = {
    findById: vi.fn(),
    create: vi.fn(),
    revoke: vi.fn(),
  } as unknown as ApiKeyRepository;
  const mockProfileRepo = { ensureExists: vi.fn() } as unknown as AuthProfileRepository;
  let setContextMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetAllMocks();

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
    setContextMock = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns AuthContext for a valid PAT and intersects scopes with workspace role', async () => {
    vi.spyOn(authLib, 'verifyTokenSecret').mockReturnValue(true);

    vi.mocked(mockApiKeyRepo.findById).mockResolvedValue({
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
      createdAt: new Date(),
      user: {
        id: 'user-pat',
        userState: 'active',
        profileId: 'profile-1',
      },
    });

    vi.mocked(mockMembershipRepo.findFirst).mockImplementation(
      async (_userId: string, workspaceId: string) => {
        if (workspaceId === WORKSPACE_ID) {
          return { workspaceId: WORKSPACE_ID, role: 'owner' };
        }
        return null;
      }
    );

    vi.mocked(mockMembershipRepo.findManyByUserId).mockResolvedValue([]);

    const service = new AuthCoreService({
      prisma: {} as unknown as PrismaClient,
      userRepo: mockUserRepo,
      sessionRepo: mockSessionRepo,
      membershipRepo: mockMembershipRepo,
      apiKeyRepo: mockApiKeyRepo,
      profileRepo: mockProfileRepo,
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
      expect.anything(),
      expect.objectContaining({
        userId: 'user-pat',
        profileId: 'profile-1',
        workspaceId: WORKSPACE_ID,
      })
    );
  });

  it('throws when PAT is revoked', async () => {
    vi.spyOn(authLib, 'verifyTokenSecret').mockReturnValue(true);

    vi.mocked(mockApiKeyRepo.findById).mockResolvedValue({
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
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      createdAt: new Date(),
      user: {
        id: 'user-pat',
        userState: 'active',
        profileId: 'profile-1',
      },
    });

    const service = new AuthCoreService({
      prisma: {} as unknown as PrismaClient,
      userRepo: mockUserRepo,
      sessionRepo: mockSessionRepo,
      membershipRepo: mockMembershipRepo,
      apiKeyRepo: mockApiKeyRepo,
      profileRepo: mockProfileRepo,
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

    vi.mocked(mockApiKeyRepo.findById).mockResolvedValue({
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
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
      user: {
        id: 'user-pat',
        userState: 'active',
        profileId: 'profile-1',
      },
    });

    vi.mocked(mockMembershipRepo.findFirst).mockResolvedValue({
      workspaceId: WORKSPACE_ID,
      role: 'viewer',
    });
    vi.mocked(mockMembershipRepo.findManyByUserId).mockResolvedValue([]);

    const service = new AuthCoreService({
      prisma: {} as unknown as PrismaClient,
      userRepo: mockUserRepo,
      sessionRepo: mockSessionRepo,
      membershipRepo: mockMembershipRepo,
      apiKeyRepo: mockApiKeyRepo,
      profileRepo: mockProfileRepo,
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

    vi.mocked(mockApiKeyRepo.findById).mockResolvedValue({
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
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
      user: {
        id: 'user-pat',
        userState: 'active',
        profileId: 'profile-1',
      },
    });

    vi.mocked(mockMembershipRepo.findFirst).mockResolvedValue({
      workspaceId: WORKSPACE_ID,
      role: 'viewer',
    });
    vi.mocked(mockMembershipRepo.findManyByUserId).mockResolvedValue([]);

    const service = new AuthCoreService({
      prisma: {} as unknown as PrismaClient,
      userRepo: mockUserRepo,
      sessionRepo: mockSessionRepo,
      membershipRepo: mockMembershipRepo,
      apiKeyRepo: mockApiKeyRepo,
      profileRepo: mockProfileRepo,
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

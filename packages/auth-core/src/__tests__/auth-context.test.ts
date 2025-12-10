import { generateKeyPairSync } from 'node:crypto';
import type { PrismaClient } from '@repo/database';
import { exportJWK } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '../errors.js';
import type {
  ApiKeyRepository,
  AuthProfileRepository,
  AuthSessionRepository,
  AuthUserRepository,
  WorkspaceMembershipRepository,
} from '../interfaces.js';
import { AuthCoreService } from '../service.js';
import { type SigningKey, SigningKeyStore, signAccessToken } from '../signing.js';

const ISSUER = 'http://localhost:3000';
const AUDIENCE = `${ISSUER}/v1`;
const WORKSPACE_ID_1 = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID_2 = '22222222-2222-4222-8222-222222222222';

describe('AuthCoreService.resolveWorkspaceContext', () => {
  let signingKey: SigningKey;
  let keyStore: SigningKeyStore;

  // Mocks
  const mockUserRepo = {
    findById: vi.fn(),
  } as unknown as AuthUserRepository;
  const mockSessionRepo = {
    findById: vi.fn(),
  } as unknown as AuthSessionRepository;
  const mockMembershipRepo = {
    findManyByUserId: vi.fn(),
    findFirst: vi.fn(),
  } as unknown as WorkspaceMembershipRepository;
  const mockApiKeyRepo = {
    findById: vi.fn(),
  } as unknown as ApiKeyRepository;
  const mockProfileRepo = {
    ensureExists: vi.fn(),
  } as unknown as AuthProfileRepository;

  let setContextMock: ReturnType<typeof vi.fn>;
  let service: AuthCoreService;

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

    service = new AuthCoreService({
      prisma: {} as unknown as PrismaClient, // Mock PrismaClient for setContext
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

    // Default user setup
    vi.mocked(mockUserRepo.findById).mockResolvedValue({
      id: 'user-123',
      userState: 'active',
      primaryEmail: 'user@example.com',
      profileId: 'profile-123',
    });

    // Default session setup
    vi.mocked(mockSessionRepo.findById).mockResolvedValue({
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
    vi.mocked(mockMembershipRepo.findManyByUserId).mockResolvedValue([]);
    vi.mocked(mockMembershipRepo.findFirst).mockResolvedValue(null);

    const token = await createToken();
    const context = await service.verifyRequest({
      authorizationHeader: `Bearer ${token}`,
    });

    expect(context?.activeWorkspaceId).toBeNull();
    expect(context?.allowedWorkspaces).toEqual([]);
  });

  it('should auto-select workspace when user has exactly one membership', async () => {
    vi.mocked(mockMembershipRepo.findManyByUserId).mockResolvedValue([
      { workspaceId: WORKSPACE_ID_1, role: 'owner' },
    ]);
    vi.mocked(mockMembershipRepo.findFirst).mockResolvedValue({
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
    vi.mocked(mockMembershipRepo.findManyByUserId).mockResolvedValue([
      { workspaceId: WORKSPACE_ID_1, role: 'owner' },
      { workspaceId: WORKSPACE_ID_2, role: 'member' },
    ]);
    vi.mocked(mockMembershipRepo.findFirst).mockResolvedValue(null);

    const token = await createToken();

    await expect(
      service.verifyRequest({
        authorizationHeader: `Bearer ${token}`,
      })
    ).rejects.toThrow(AuthorizationError);
  });

  it('should succeed when user has multiple workspaces and provides valid header', async () => {
    vi.mocked(mockMembershipRepo.findManyByUserId).mockResolvedValue([
      { workspaceId: WORKSPACE_ID_1, role: 'owner' },
      { workspaceId: WORKSPACE_ID_2, role: 'member' },
    ]);

    vi.mocked(mockMembershipRepo.findFirst).mockImplementation(
      async (_userId: string, workspaceId: string) => {
        if (workspaceId === WORKSPACE_ID_2) {
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
    vi.mocked(mockMembershipRepo.findFirst).mockResolvedValue(null);

    const token = await createToken();

    await expect(
      service.verifyRequest({
        authorizationHeader: `Bearer ${token}`,
        workspaceHeader: 'invalid-uuid',
      })
    ).rejects.toThrow(AuthorizationError);
  });
});

import type { PrismaClient, Token as PrismaToken } from '@repo/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenService } from '../token-service.js';
import type { TokenHashEnvelope } from '../types.js';

function buildToken(overrides: Partial<PrismaToken> = {}): PrismaToken {
  const now = new Date('2025-01-01T00:00:00.000Z');
  return {
    id: 'tok_123',
    userId: 'user_123',
    sessionId: 'sess_123',
    workspaceId: null,
    type: 'refresh',
    tokenHash: {
      algo: 'hmac-sha256',
      keyId: 'v1',
      hash: 'hash-secret',
      issuedAt: now.toISOString(),
    } satisfies TokenHashEnvelope,
    scopes: [],
    name: null,
    familyId: 'family_123',
    metadata: null,
    lastUsedAt: null,
    expiresAt: new Date('2025-02-01T00:00:00.000Z'),
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('TokenService.issueRefreshToken', () => {
  const mockCreate = vi.fn();
  const prismaStub = {
    token: {
      create: mockCreate,
    },
  } as unknown as PrismaClient;

  const mockTokenFactory = vi.fn().mockReturnValue({
    tokenId: 'tok_abc',
    tokenSecret: 'secret-abc',
    value: 'tok_abc.secret-abc',
  });

  const hashEnvelope = {
    algo: 'hmac-sha256',
    keyId: 'v1',
    hash: 'hashed-secret',
    issuedAt: new Date('2025-01-01T00:00:00.000Z').toISOString(),
  } satisfies TokenHashEnvelope;

  const mockHashFactory = vi.fn().mockReturnValue(hashEnvelope);

  beforeEach(() => {
    mockCreate.mockReset();
    mockTokenFactory.mockClear();
    mockHashFactory.mockClear();
  });

  it('creates and returns a refresh token with generated familyId', async () => {
    const familyIdFactory = vi.fn().mockReturnValue('family_generated');
    const service = new TokenService({
      prisma: prismaStub,
      createOpaqueToken: mockTokenFactory,
      createTokenHashEnvelope: mockHashFactory,
      familyIdFactory,
    });

    const expiresAt = new Date('2025-02-10T00:00:00.000Z');
    mockCreate.mockResolvedValue(
      buildToken({
        id: 'tok_abc',
        familyId: 'family_generated',
        expiresAt,
      })
    );

    const result = await service.issueRefreshToken({
      userId: 'user_123',
      sessionId: 'sess_123',
      expiresAt,
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'tok_abc',
        userId: 'user_123',
        sessionId: 'sess_123',
        familyId: 'family_generated',
        tokenHash: hashEnvelope,
        expiresAt,
      }),
    });

    expect(result.refreshToken).toBe('tok_abc.secret-abc');
    expect(result.token.familyId).toBe('family_generated');
    expect(result.token.sessionId).toBe('sess_123');
    expect(result.token.expiresAt.toISOString()).toBe(expiresAt.toISOString());
  });

  it('reuses provided familyId', async () => {
    const service = new TokenService({
      prisma: prismaStub,
      createOpaqueToken: mockTokenFactory,
      createTokenHashEnvelope: mockHashFactory,
      familyIdFactory: vi.fn().mockReturnValue('should_not_use'),
    });

    const expiresAt = new Date('2025-03-01T00:00:00.000Z');
    mockCreate.mockResolvedValue(
      buildToken({
        id: 'tok_abc',
        familyId: 'family_existing',
        expiresAt,
      })
    );

    await service.issueRefreshToken({
      userId: 'user_123',
      sessionId: 'sess_123',
      expiresAt,
      familyId: 'family_existing',
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        familyId: 'family_existing',
      }),
    });
  });

  it('throws when expiresAt is invalid', async () => {
    const service = new TokenService({
      prisma: prismaStub,
      createOpaqueToken: mockTokenFactory,
      createTokenHashEnvelope: mockHashFactory,
    });

    await expect(
      service.issueRefreshToken({
        userId: 'user_123',
        sessionId: 'sess_123',
        expiresAt: new Date('invalid-date'),
      })
    ).rejects.toThrow('expiresAt must be a valid Date instance');
  });
});

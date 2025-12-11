import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RefreshTokenRepository } from '../interfaces.js';
import { TokenService } from '../token-service.js';
import type { RefreshTokenRecord, TokenHashEnvelope } from '../types.js';

function buildRefreshTokenRecord(overrides: Partial<RefreshTokenRecord> = {}): RefreshTokenRecord {
  const now = new Date('2025-01-01T00:00:00.000Z');
  const hashEnvelope: TokenHashEnvelope = {
    algo: 'hmac-sha256',
    keyId: 'v1',
    hash: 'hash-secret',
    issuedAt: now.toISOString(),
    salt: 'test-salt',
  };
  return {
    id: 'tok_123',
    userId: 'user_123',
    sessionId: 'sess_123',
    workspaceId: null,
    type: 'refresh',
    tokenHash: hashEnvelope,
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
  const repoStub = {
    create: mockCreate,
  } as unknown as RefreshTokenRepository;

  const mockTokenFactory = vi.fn().mockReturnValue({
    tokenId: 'tok_abc',
    tokenSecret: 'secret-abc',
    value: 'rt_tok_abc.secret-abc',
  });

  const hashEnvelope = {
    algo: 'hmac-sha256',
    keyId: 'v1',
    hash: 'hashed-secret',
    issuedAt: new Date('2025-01-01T00:00:00.000Z').toISOString(),
    salt: 'test-salt',
  } satisfies TokenHashEnvelope;

  const mockHashFactory = vi.fn().mockReturnValue(hashEnvelope);

  beforeEach(() => {
    mockCreate.mockReset();
    mockTokenFactory.mockClear();
    mockHashFactory.mockClear();
  });

  it('creates and returns a refresh token', async () => {
    const service = new TokenService({
      repo: repoStub,
      createOpaqueToken: mockTokenFactory,
      createTokenHashEnvelope: mockHashFactory,
    });

    const expiresAt = new Date('2025-02-10T00:00:00.000Z');
    mockCreate.mockResolvedValue(
      buildRefreshTokenRecord({
        id: 'tok_abc',
        expiresAt,
        familyId: null,
      })
    );

    const result = await service.issueRefreshToken({
      userId: 'user_123',
      sessionId: 'sess_123',
      expiresAt,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tok_abc',
        userId: 'user_123',
        sessionId: 'sess_123',
        hashEnvelope,
        expiresAt,
      })
    );

    expect(result.refreshToken).toBe('rt_tok_abc.secret-abc');
    expect(result.token.familyId).toBeNull();
    expect(result.token.sessionId).toBe('sess_123');
    expect(result.token.expiresAt.toISOString()).toBe(expiresAt.toISOString());
  });

  it('throws when expiresAt is invalid', async () => {
    const service = new TokenService({
      repo: repoStub,
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

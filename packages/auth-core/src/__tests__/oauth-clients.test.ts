import type { PrismaClient } from '@repo/database';
import { describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '../errors.js';
import { findOAuthClient, requireOAuthClient, validateRedirectUri } from '../oauth-clients.js';

const baseClient = {
  id: 'client-1',
  clientId: 'mobile',
  type: 'public' as const,
  redirectUris: ['sb://callback', 'http://localhost:3000/v1/auth/callback/mobile'],
  disabledAt: null as Date | null,
};

function mockClientDelegate(result: unknown) {
  return {
    oAuthClient: {
      findUnique: vi.fn().mockResolvedValue(result),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
      findRaw: vi.fn(),
      aggregateRaw: vi.fn(),
    },
  } as unknown as Pick<PrismaClient, 'oAuthClient'>;
}

describe('oauth client helpers', () => {
  it('finds a client by client_id', async () => {
    const prisma = mockClientDelegate(baseClient);

    const client = await findOAuthClient(prisma, 'mobile');
    expect(client?.clientId).toBe('mobile');
  });

  it('validates redirect URIs', () => {
    expect(validateRedirectUri(baseClient, 'sb://callback')).toBe('sb://callback');
    expect(() => validateRedirectUri(baseClient, 'https://example.com/cb')).toThrow(
      AuthorizationError
    );
  });

  it('requires an active client and allowed redirect URI', async () => {
    const prisma = mockClientDelegate(baseClient);

    const client = await requireOAuthClient({
      prisma,
      clientId: 'mobile',
      redirectUri: 'sb://callback',
    });

    expect(client.clientId).toBe('mobile');
  });

  it('throws for disabled clients', async () => {
    const prisma = mockClientDelegate({ ...baseClient, disabledAt: new Date() });

    await expect(
      requireOAuthClient({ prisma, clientId: 'mobile', redirectUri: 'sb://callback' })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('throws for unknown clients', async () => {
    const prisma = mockClientDelegate(null);

    await expect(
      requireOAuthClient({ prisma, clientId: 'unknown', redirectUri: 'sb://callback' })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

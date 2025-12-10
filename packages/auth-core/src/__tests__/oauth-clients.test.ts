import { describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '../errors.js';
import type { OAuthClientRepository } from '../interfaces.js';
import {
  findOAuthClient,
  normalizeRedirectUri,
  requireOAuthClient,
  validateRedirectUri,
} from '../oauth-clients.js';
import type { OAuthClientRecord } from '../types.js';

const baseClient: OAuthClientRecord = {
  id: 'client-1',
  clientId: 'mobile',
  type: 'public',
  redirectUris: ['sb://callback', 'http://localhost:3000/v1/auth/callback/mobile'],
  tokenEndpointAuthMethod: 'none',
  isFirstParty: true,
  disabledAt: null,
};

function mockRepository(client: OAuthClientRecord | null): OAuthClientRepository {
  return {
    findByClientId: vi.fn().mockResolvedValue(client),
    findClientSecret: vi.fn().mockResolvedValue(null),
  };
}

describe('oauth client helpers', () => {
  it('finds a client by client_id', async () => {
    const repo = mockRepository(baseClient);

    const client = await findOAuthClient(repo, 'mobile');
    expect(client?.clientId).toBe('mobile');
    expect(repo.findByClientId).toHaveBeenCalledWith('mobile');
  });

  it('validates redirect URIs', () => {
    expect(validateRedirectUri(baseClient, 'sb://callback')).toBe('sb://callback');
    expect(() => validateRedirectUri(baseClient, 'https://example.com/cb')).toThrow(
      AuthorizationError
    );
    expect(() => validateRedirectUri(baseClient, '   ')).toThrow(AuthorizationError);
  });

  it('normalizes redirect URIs before comparison', () => {
    expect(validateRedirectUri(baseClient, ' sb://callback ')).toBe('sb://callback');
    expect(normalizeRedirectUri(' http://localhost:3000/v1/auth/callback/mobile ')).toBe(
      'http://localhost:3000/v1/auth/callback/mobile'
    );
  });

  it('requires an active client and allowed redirect URI', async () => {
    const repo = mockRepository(baseClient);

    const client = await requireOAuthClient({
      repo,
      clientId: 'mobile',
      redirectUri: 'sb://callback',
    });

    expect(client.clientId).toBe('mobile');
  });

  it('throws for disabled clients', async () => {
    const disabledClient = { ...baseClient, disabledAt: new Date() };
    const repo = mockRepository(disabledClient);

    await expect(
      requireOAuthClient({ repo, clientId: 'mobile', redirectUri: 'sb://callback' })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('throws for unknown clients', async () => {
    const repo = mockRepository(null);

    await expect(
      requireOAuthClient({ repo, clientId: 'unknown', redirectUri: 'sb://callback' })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

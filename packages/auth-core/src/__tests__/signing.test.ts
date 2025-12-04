import { jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  type AuthCoreEnvironment,
  loadAuthCoreConfig,
} from '../config.js';
import { signAccessToken } from '../signing.js';

describe('signAccessToken', () => {
  it('should include scp claim when scopes are provided', async () => {
    const config = loadAuthCoreConfig();
    const keyStore = await buildKeyStoreFromConfig(config);

    const { token, claims } = await signAccessToken(keyStore, config, {
      userId: 'user-123',
      scopes: ['read:workspaces', 'write:profile'],
    });

    expect(claims.scp).toEqual(['read:workspaces', 'write:profile']);

    const verified = await jwtVerify(token, keyStore.getVerificationKey().publicKey);
    expect((verified.payload as { scp?: string[] }).scp).toEqual([
      'read:workspaces',
      'write:profile',
    ]);
  });

  it('should use ACCESS_TOKEN_TTL_SECONDS by default', async () => {
    const config = loadAuthCoreConfig();
    const keyStore = await buildKeyStoreFromConfig(config);

    const { claims } = await signAccessToken(keyStore, config, {
      userId: 'user-123',
    });

    const expectedExp = claims.iat + ACCESS_TOKEN_TTL_SECONDS;
    expect(claims.exp).toBe(expectedExp);
  });
});

// Helper to build key store since it's not exported directly in a test-friendly way
async function buildKeyStoreFromConfig(config: AuthCoreEnvironment) {
  const { buildSigningKey, SigningKeyStore } = await import('../signing.js');
  const key = await buildSigningKey(config);
  return new SigningKeyStore([key], config.keyId);
}

import { createPrivateKey, createPublicKey, randomUUID } from 'node:crypto';
import { type JWK, type JWTPayload, type KeyLike, SignJWT, exportJWK } from 'jose';
import type { AuthCoreEnvironment, VerificationKeyConfig } from './config.js';
import type { AccessTokenClaims, ClientType } from './types.js';

export type SigningKey = {
  kid: string;
  alg: 'EdDSA' | 'RS256';
  privateKey: KeyLike | null;
  publicKey: KeyLike;
  jwk: JWK;
};

export class SigningKeyStore {
  private keyMap = new Map<string, SigningKey>();

  constructor(
    keys: SigningKey[],
    private activeKid: string
  ) {
    for (const key of keys) {
      if (this.keyMap.has(key.kid)) {
        throw new Error(`Duplicate signing key id detected: ${key.kid}`);
      }
      this.keyMap.set(key.kid, key);
    }
    if (!this.keyMap.size) {
      throw new Error('SigningKeyStore requires at least one key');
    }

    if (!this.keyMap.has(activeKid)) {
      throw new Error(`Active signing key "${activeKid}" not found`);
    }
  }

  getActiveKey(): SigningKey & { privateKey: KeyLike } {
    const key = this.keyMap.get(this.activeKid);
    if (!key) {
      throw new Error(`Active signing key "${this.activeKid}" not found`);
    }
    if (!key.privateKey) {
      throw new Error(`Active signing key "${this.activeKid}" is missing a private key`);
    }
    return key as SigningKey & { privateKey: KeyLike };
  }

  getVerificationKey(kid?: string): SigningKey {
    if (kid) {
      const key = this.keyMap.get(kid);
      if (key) {
        return key;
      }
    }
    return this.getActiveKey();
  }

  getJwks() {
    return {
      keys: Array.from(this.keyMap.values()).map((key) => ({
        ...key.jwk,
        kid: key.kid,
        use: 'sig' as const,
        alg: key.alg,
      })),
    };
  }
}

export async function buildSigningKey(config: AuthCoreEnvironment): Promise<SigningKey> {
  const privateKey = createPrivateKey({
    key: config.privateKeyPem,
    format: 'pem',
  });
  const publicKey = createPublicKey(privateKey);
  const jwk = await exportJWK(publicKey);

  return {
    kid: config.keyId,
    alg: config.algorithm,
    privateKey,
    publicKey,
    jwk,
  };
}

export async function buildVerificationKey(config: VerificationKeyConfig): Promise<SigningKey> {
  const publicKey = createPublicKey({
    key: config.publicKeyPem,
    format: 'pem',
  });
  const jwk = await exportJWK(publicKey);

  return {
    kid: config.kid,
    alg: config.alg,
    privateKey: null,
    publicKey,
    jwk,
  };
}

export type SignAccessTokenParams = {
  userId: string;
  sessionId?: string | null;
  workspaceId?: string | null;
  actorSub?: string | null;
  clientType?: ClientType;
  expiresInSeconds?: number;
  jti?: string;
};

export async function signAccessToken(
  keyStore: SigningKeyStore,
  config: Pick<AuthCoreEnvironment, 'issuer' | 'audience'>,
  params: SignAccessTokenParams
): Promise<{ token: string; claims: AccessTokenClaims }> {
  const key = keyStore.getActiveKey();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresInSeconds = params.expiresInSeconds ?? 15 * 60;
  const exp = issuedAt + expiresInSeconds;
  const jti = params.jti ?? randomUUID();

  const payload: JWTPayload = {
    sub: params.userId,
    sid: params.sessionId ?? undefined,
    wid: params.workspaceId ?? undefined,
    act: params.actorSub ?? undefined,
    token_use: 'access',
    jti,
    client_type: params.clientType ?? 'web',
  };

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: key.alg, kid: key.kid, typ: 'JWT' })
    .setIssuedAt(issuedAt)
    .setExpirationTime(exp)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .sign(key.privateKey);

  return {
    token,
    claims: {
      ...(payload as AccessTokenClaims),
      iss: config.issuer,
      aud: config.audience,
      iat: issuedAt,
      exp,
    },
  };
}

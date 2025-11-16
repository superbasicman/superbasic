import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const DEFAULT_CLOCK_SKEW_TOLERANCE_SECONDS = 60;

export type AuthCoreEnvironment = {
  issuer: string;
  audience: string;
  algorithm: 'EdDSA' | 'RS256';
  keyId: string;
  privateKeyPem: string;
  clockToleranceSeconds: number;
};

function decodeKeyMaterial(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('-----BEGIN')) {
    return trimmed;
  }

  try {
    return Buffer.from(trimmed, 'base64').toString('utf8');
  } catch (error) {
    throw new Error('Invalid AUTH_JWT_PRIVATE_KEY value. Expected PEM or base64-encoded PEM.');
  }
}

function readPrivateKeyFromEnv(env: NodeJS.ProcessEnv): string {
  if (env.AUTH_JWT_PRIVATE_KEY_FILE) {
    const path = resolve(env.AUTH_JWT_PRIVATE_KEY_FILE);
    return readFileSync(path, 'utf8');
  }

  const raw = env.AUTH_JWT_PRIVATE_KEY;
  if (!raw) {
    throw new Error(
      'AUTH_JWT_PRIVATE_KEY or AUTH_JWT_PRIVATE_KEY_FILE must be set to load signing keys.'
    );
  }

  return decodeKeyMaterial(raw);
}

export function loadAuthCoreConfig(env: NodeJS.ProcessEnv = process.env): AuthCoreEnvironment {
  const issuer = env.AUTH_JWT_ISSUER ?? env.AUTH_URL ?? 'http://localhost:3000';
  const audience = env.AUTH_JWT_AUDIENCE ?? `${issuer}/v1`;
  const keyId = env.AUTH_JWT_KEY_ID ?? 'dev-access-key';
  const algorithm = (env.AUTH_JWT_ALGORITHM ?? 'EdDSA') as 'EdDSA' | 'RS256';

  if (algorithm !== 'EdDSA' && algorithm !== 'RS256') {
    throw new Error(`Unsupported AUTH_JWT_ALGORITHM value: ${algorithm}`);
  }

  const privateKeyPem = readPrivateKeyFromEnv(env);

  return {
    issuer,
    audience,
    algorithm,
    keyId,
    privateKeyPem,
    clockToleranceSeconds:
      Number.parseInt(env.AUTH_JWT_CLOCK_TOLERANCE_SECONDS ?? '', 10) ||
      DEFAULT_CLOCK_SKEW_TOLERANCE_SECONDS,
  };
}

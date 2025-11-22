import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const DEFAULT_CLOCK_SKEW_TOLERANCE_SECONDS = 60;

export type AuthCoreEnvironment = {
  issuer: string;
  audience: string;
  algorithm: 'EdDSA' | 'RS256';
  keyId: string;
  privateKeyPem: string;
  verificationKeys: VerificationKeyConfig[];
  clockToleranceSeconds: number;
};

export type VerificationKeyConfig = {
  kid: string;
  alg: 'EdDSA' | 'RS256';
  publicKeyPem: string;
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

function parseAdditionalPublicKeys(raw: string, defaultAlgorithm: 'EdDSA' | 'RS256') {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error('AUTH_JWT_ADDITIONAL_PUBLIC_KEYS is not valid JSON');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('AUTH_JWT_ADDITIONAL_PUBLIC_KEYS must be a JSON array');
  }

  return parsed.map((entry, index): VerificationKeyConfig => {
    const source = `AUTH_JWT_ADDITIONAL_PUBLIC_KEYS[${index}]`;
    if (!entry || typeof entry !== 'object') {
      throw new Error(`${source} must be an object with kid/publicKey fields`);
    }

    const kid = 'kid' in entry ? String((entry as Record<string, unknown>).kid ?? '') : '';
    const publicKey =
      'publicKey' in entry ? String((entry as Record<string, unknown>).publicKey ?? '') : '';
    const alg =
      'alg' in entry ? String((entry as Record<string, unknown>).alg ?? '') : defaultAlgorithm;

    if (!kid.trim()) {
      throw new Error(`${source}.kid is required`);
    }
    if (!publicKey.trim()) {
      throw new Error(`${source}.publicKey is required`);
    }

    if (alg !== 'EdDSA' && alg !== 'RS256') {
      throw new Error(`${source}.alg must be "EdDSA" or "RS256"`);
    }

    return {
      kid: kid.trim(),
      alg,
      publicKeyPem: decodeKeyMaterial(publicKey),
    };
  });
}

function readAdditionalPublicKeys(env: NodeJS.ProcessEnv, defaultAlgorithm: 'EdDSA' | 'RS256') {
  let raw = env.AUTH_JWT_ADDITIONAL_PUBLIC_KEYS;

  if (env.AUTH_JWT_ADDITIONAL_PUBLIC_KEYS_FILE) {
    const path = resolve(env.AUTH_JWT_ADDITIONAL_PUBLIC_KEYS_FILE);
    raw = readFileSync(path, 'utf8');
  }

  if (!raw || !raw.trim()) {
    return [];
  }

  return parseAdditionalPublicKeys(raw.trim(), defaultAlgorithm);
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
  const verificationKeys = readAdditionalPublicKeys(env, algorithm);

  return {
    issuer,
    audience,
    algorithm,
    keyId,
    privateKeyPem,
    verificationKeys,
    clockToleranceSeconds:
      Number.parseInt(env.AUTH_JWT_CLOCK_TOLERANCE_SECONDS ?? '', 10) ||
      DEFAULT_CLOCK_SKEW_TOLERANCE_SECONDS,
  };
}

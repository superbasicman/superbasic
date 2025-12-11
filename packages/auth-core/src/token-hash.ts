import { createHmac, randomUUID } from 'node:crypto';
import type { TokenHashEnvelope } from './types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TOKEN_SECRET_LENGTH_BYTES = 32;
const DEFAULT_HASH_ALGO = 'hmac-sha256';
const DEFAULT_KEY_ID = 'v1';

export interface OpaqueToken {
  value: string;
  tokenId: string;
  tokenSecret: string;
}

function extractTokenSecret(token: string): { tokenId: string | null; tokenSecret: string } | null {
  if (token.includes('_') && token.includes('.')) {
    const [prefixPart, rest] = token.split('_');
    if (!prefixPart || !rest) {
      return null;
    }
    const [tokenId, tokenSecret] = rest.split('.');
    if (!tokenId || !tokenSecret) {
      return null;
    }
    if (!UUID_PATTERN.test(tokenId)) {
      return null;
    }
    return { tokenId, tokenSecret };
  }

  // Fallback: treat input as raw secret (no tokenId/prefix)
  if (token && typeof token === 'string') {
    return { tokenId: null, tokenSecret: token };
  }
  return null;
}

export function createOpaqueToken(options?: {
  prefix?: string;
  secretLength?: number;
}): OpaqueToken {
  const prefix = options?.prefix ?? 'sbf';
  const secretLength = options?.secretLength ?? TOKEN_SECRET_LENGTH_BYTES;
  const tokenId = randomUUID();
  const tokenSecret = randomUUID()
    .replace(/-/g, '')
    .slice(0, secretLength)
    .padEnd(secretLength, '0');
  const value = `${prefix}_${tokenId}.${tokenSecret}`;
  return { value, tokenId, tokenSecret };
}

export function parseOpaqueToken(
  token: string,
  options?: { expectedPrefix?: string; allowLegacy?: boolean }
): { tokenId: string; tokenSecret: string } | null {
  const [prefixPart, rest] = token.split('_');
  if (!prefixPart || !rest) {
    return null;
  }

  const [tokenId, tokenSecret] = rest.split('.');
  if (!tokenId || !tokenSecret) {
    return null;
  }

  if (options?.expectedPrefix && prefixPart !== options.expectedPrefix) {
    return null;
  }

  if (!UUID_PATTERN.test(tokenId)) {
    if (options?.allowLegacy) {
      return { tokenId, tokenSecret };
    }
    return null;
  }

  return { tokenId, tokenSecret };
}

export function createTokenHashEnvelope(token: string): TokenHashEnvelope {
  const parsed = extractTokenSecret(token);
  if (!parsed) {
    throw new Error('Invalid token format');
  }

  const salt = randomUUID();
  const hmac = createHmac('sha256', `${DEFAULT_KEY_ID}:${salt}`);
  hmac.update(parsed.tokenSecret);
  const hash = hmac.digest('hex');

  return {
    algo: DEFAULT_HASH_ALGO,
    keyId: DEFAULT_KEY_ID,
    hash,
    issuedAt: new Date().toISOString(),
    salt,
  };
}

export function verifyTokenSecret(token: string, envelope: unknown): boolean {
  const candidate = envelope as TokenHashEnvelope | undefined;

  if (!candidate || candidate.algo !== DEFAULT_HASH_ALGO || !candidate.hash || !candidate.salt) {
    return false;
  }

  const parsed = extractTokenSecret(token);
  if (!parsed) {
    return false;
  }

  const hmac = createHmac('sha256', `${candidate.keyId}:${candidate.salt}`);
  hmac.update(parsed.tokenSecret);
  const expectedHash = hmac.digest('hex');

  if (expectedHash.length !== candidate.hash.length) {
    return false;
  }

  // Constant-time comparison
  let isValid = true;
  for (let i = 0; i < expectedHash.length; i++) {
    if (expectedHash.charCodeAt(i) !== candidate.hash.charCodeAt(i)) {
      isValid = false;
    }
  }

  return isValid;
}

export type { TokenHashEnvelope } from './types.js';

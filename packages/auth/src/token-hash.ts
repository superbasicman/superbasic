import crypto from 'node:crypto';

export interface TokenHashEnvelope {
  algo: 'hmac-sha256';
  keyId: string;
  hash: string;
  issuedAt: string;
  salt?: string;
  [key: string]: string | undefined;
}

const TOKEN_HASH_ALGO: TokenHashEnvelope['algo'] = 'hmac-sha256';
const OPAQUE_TOKEN_DELIMITER = '.';
const OPAQUE_TOKEN_PREFIX_DELIMITER = '_';
const DEFAULT_TOKEN_SECRET_BYTES = 32;
const DEFAULT_TOKEN_SALT_BYTES = 16;
const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

type TokenHashKeyConfig = Record<string, string>;

function parseTokenHashKeys(): TokenHashKeyConfig {
  const rawKeys = process.env.TOKEN_HASH_KEYS;
  if (rawKeys) {
    try {
      // Support env values that may be wrapped in quotes and/or whitespace
      const trimmed = rawKeys.trim();
      const unwrapped =
        (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"'))
          ? trimmed.slice(1, -1)
          : trimmed;

      const parsed = JSON.parse(unwrapped) as TokenHashKeyConfig;
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('TOKEN_HASH_KEYS must be a JSON object of { keyId: secret }');
      }
      return parsed;
    } catch (error) {
      throw new Error(
        `Failed to parse TOKEN_HASH_KEYS. Expected JSON object, received "${rawKeys}".`
      );
    }
  }

  // Fallback for local dev/test: reuse AUTH_SECRET so we don't block env setup.
  const fallback = process.env.TOKEN_HASH_FALLBACK_SECRET || process.env.AUTH_SECRET;
  if (fallback) {
    return { v1: fallback };
  }

  throw new Error(
    'TOKEN_HASH_KEYS is required (JSON object of { keyId: secret }). ' +
      'Set TOKEN_HASH_KEYS or TOKEN_HASH_FALLBACK_SECRET/AUTH_SECRET in your environment.'
  );
}

const tokenHashKeys = parseTokenHashKeys();
const defaultKeyId = process.env.TOKEN_HASH_ACTIVE_KEY_ID || Object.keys(tokenHashKeys)[0] || 'v1';

function getKeyForId(keyId: string): string | null {
  return tokenHashKeys[keyId] ?? tokenHashKeys[defaultKeyId] ?? null;
}

export function createTokenHashEnvelope(
  tokenSecret: string,
  options?: { keyId?: string; issuedAt?: Date; saltBytes?: number; salt?: string }
): TokenHashEnvelope {
  const keyId = options?.keyId ?? defaultKeyId;
  const secretKey = getKeyForId(keyId);

  if (!secretKey) {
    throw new Error(
      `Token hash key "${keyId}" is not configured. Check TOKEN_HASH_KEYS env variable.`
    );
  }

  const salt =
    options?.salt ??
    crypto.randomBytes(options?.saltBytes ?? DEFAULT_TOKEN_SALT_BYTES).toString('base64url');
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(salt);
  hmac.update(':');
  hmac.update(tokenSecret);

  return {
    algo: TOKEN_HASH_ALGO,
    keyId,
    hash: hmac.digest('base64'),
    issuedAt: (options?.issuedAt ?? new Date()).toISOString(),
    salt,
  };
}

export function verifyTokenSecret(
  tokenSecret: string,
  envelope: unknown
): envelope is TokenHashEnvelope {
  if (
    !envelope ||
    typeof envelope !== 'object' ||
    (envelope as any).hash === undefined ||
    (envelope as any).keyId === undefined
  ) {
    return false;
  }

  const payload = envelope as TokenHashEnvelope;

  if (payload.algo !== TOKEN_HASH_ALGO || typeof payload.hash !== 'string') {
    return false;
  }

  const secretKey = getKeyForId(payload.keyId);
  if (!secretKey) {
    return false;
  }

  const salt = payload.salt ?? '';
  const hmac = crypto.createHmac('sha256', secretKey);
  if (salt) {
    hmac.update(salt);
    hmac.update(':');
  }
  hmac.update(tokenSecret);
  const computed = hmac.digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(payload.hash));
  } catch {
    return false;
  }
}

export interface OpaqueToken {
  tokenId: string;
  tokenSecret: string;
  value: string;
  prefix?: string | null;
}

export function createOpaqueToken(options?: {
  secretLength?: number;
  prefix?: string | null;
}): OpaqueToken {
  const secretLength = options?.secretLength ?? DEFAULT_TOKEN_SECRET_BYTES;
  const prefix = options?.prefix ?? null;
  const tokenId = crypto.randomUUID();
  const tokenSecret = crypto.randomBytes(secretLength).toString('base64url');
  return {
    tokenId,
    tokenSecret,
    value: prefix
      ? `${prefix}${OPAQUE_TOKEN_PREFIX_DELIMITER}${tokenId}${OPAQUE_TOKEN_DELIMITER}${tokenSecret}`
      : `${tokenId}${OPAQUE_TOKEN_DELIMITER}${tokenSecret}`,
    prefix,
  };
}

export function parseOpaqueToken(
  token: string,
  options?: { expectedPrefix?: string | string[]; allowLegacy?: boolean }
): { tokenId: string; tokenSecret: string; prefix: string | null } | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const expectedPrefixes = options?.expectedPrefix
    ? Array.isArray(options.expectedPrefix)
      ? options.expectedPrefix
      : [options.expectedPrefix]
    : null;

  const withPrefixMatch = token.match(/^([a-zA-Z0-9]+)_([0-9a-fA-F-]{36})\.(.+)$/);
  if (withPrefixMatch) {
    const prefix = withPrefixMatch[1];
    const tokenId = withPrefixMatch[2];
    const tokenSecret = withPrefixMatch[3];
    if (!prefix || !tokenId || !tokenSecret) {
      return null;
    }
    if (expectedPrefixes && !expectedPrefixes.includes(prefix)) {
      return null;
    }
    if (!UUID_PATTERN.test(tokenId)) {
      return null;
    }
    return {
      tokenId,
      tokenSecret,
      prefix,
    };
  }

  if (expectedPrefixes) {
    return null;
  }
  if (options?.allowLegacy === false) {
    return null;
  }

  const delimiterIndex = token.indexOf(OPAQUE_TOKEN_DELIMITER);
  if (delimiterIndex <= 0 || delimiterIndex === token.length - 1) {
    return null;
  }

  const tokenId = token.slice(0, delimiterIndex);
  if (!UUID_PATTERN.test(tokenId)) {
    return null;
  }

  return {
    tokenId,
    tokenSecret: token.slice(delimiterIndex + 1),
    prefix: null,
  };
}

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AuthorizationError } from './errors.js';
import type { PkceChallenge, PkceChallengeMethod } from './types.js';

const VERIFIER_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
const MIN_VERIFIER_LENGTH = 43;
const MAX_VERIFIER_LENGTH = 128;

function validateVerifierCharacters(value: string): boolean {
  for (const char of value) {
    if (!VERIFIER_CHARSET.includes(char)) {
      return false;
    }
  }
  return true;
}

export function generateCodeVerifier(length = 64): string {
  if (length < MIN_VERIFIER_LENGTH || length > MAX_VERIFIER_LENGTH) {
    throw new AuthorizationError(
      `code_verifier length must be between ${MIN_VERIFIER_LENGTH} and ${MAX_VERIFIER_LENGTH}`
    );
  }

  const bytes = randomBytes(length);
  const characters = Array.from(bytes, (byte) => VERIFIER_CHARSET[byte % VERIFIER_CHARSET.length]);
  return characters.join('');
}

export function isValidCodeVerifier(value: string | null | undefined): value is string {
  if (!value || typeof value !== 'string') {
    return false;
  }
  if (value.length < MIN_VERIFIER_LENGTH || value.length > MAX_VERIFIER_LENGTH) {
    return false;
  }
  return validateVerifierCharacters(value);
}

export function deriveCodeChallenge(
  verifier: string,
  method: PkceChallengeMethod = 'S256'
): string {
  if (!isValidCodeVerifier(verifier)) {
    throw new AuthorizationError('code_verifier is missing or invalid');
  }

  if (method === 'plain') {
    return verifier;
  }

  const digest = createHash('sha256').update(verifier).digest('base64url');
  return digest;
}

export function normalizePkceMethod(value?: string | null): PkceChallengeMethod {
  if (!value) {
    return 'S256';
  }
  const normalized = value.toUpperCase();
  if (normalized === 'PLAIN') {
    return 'plain';
  }
  if (normalized === 'S256') {
    return 'S256';
  }
  throw new AuthorizationError('Unsupported code_challenge_method');
}

export function validatePkcePair({
  codeVerifier,
  codeChallenge,
  codeChallengeMethod,
}: {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod?: string | null;
}): PkceChallenge {
  const method = normalizePkceMethod(codeChallengeMethod);

  if (!codeChallenge || typeof codeChallenge !== 'string') {
    throw new AuthorizationError('code_challenge is required');
  }

  const expected = deriveCodeChallenge(codeVerifier, method);
  const matches = timingSafeEqual(Buffer.from(expected), Buffer.from(codeChallenge));
  if (!matches) {
    throw new AuthorizationError('Invalid code_verifier for the given code_challenge');
  }

  return { codeChallenge, codeChallengeMethod: method };
}

export function validatePkceRequest(params: {
  codeVerifier?: string | null;
  codeChallenge?: string | null;
  codeChallengeMethod?: string | null;
}): asserts params is {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod?: string | null;
} {
  if (!params.codeVerifier) {
    throw new AuthorizationError('code_verifier is required for PKCE');
  }
  if (!params.codeChallenge) {
    throw new AuthorizationError('code_challenge is required for PKCE');
  }
  validatePkcePair({
    codeVerifier: params.codeVerifier,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod ?? null,
  });
}

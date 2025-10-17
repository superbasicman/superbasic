/**
 * Personal Access Token (PAT) utilities
 *
 * Handles secure generation, hashing, and verification of API keys.
 * PATs are hashed using bcrypt before storage; plaintext is shown only once on creation.
 */

import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';

/**
 * Number of bcrypt salt rounds for PAT hashing
 * Higher values increase security but slow down hashing
 */
const SALT_ROUNDS = 10;

/**
 * PAT prefix for easy identification
 */
const PAT_PREFIX = 'sbf_';

/**
 * Length of the random token portion (in bytes)
 */
const TOKEN_LENGTH = 32;

/**
 * Generate a new Personal Access Token
 *
 * @returns Object containing the plaintext token (show once) and its hash (store in DB)
 */
export async function generatePAT(): Promise<{ token: string; hash: string }> {
  // Generate cryptographically secure random bytes
  const randomToken = randomBytes(TOKEN_LENGTH).toString('hex');

  // Create token with prefix for easy identification
  const token = `${PAT_PREFIX}${randomToken}`;

  // Hash the token for storage
  const hash = await bcrypt.hash(token, SALT_ROUNDS);

  return { token, hash };
}

/**
 * Verify a PAT against its stored hash
 *
 * @param token - The plaintext token from the Authorization header
 * @param hash - The stored bcrypt hash from the database
 * @returns True if the token matches the hash
 */
export async function verifyPAT(token: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(token, hash);
  } catch (error) {
    // bcrypt.compare can throw on invalid hash format
    return false;
  }
}

/**
 * Validate PAT format (prefix and length check)
 *
 * @param token - The token to validate
 * @returns True if the token has the correct format
 */
export function isValidPATFormat(token: string): boolean {
  if (!token.startsWith(PAT_PREFIX)) {
    return false;
  }

  // Remove prefix and check hex length
  const tokenBody = token.slice(PAT_PREFIX.length);
  const expectedLength = TOKEN_LENGTH * 2; // hex encoding doubles the length

  return tokenBody.length === expectedLength && /^[0-9a-f]+$/.test(tokenBody);
}

/**
 * Extract token from Authorization header
 *
 * @param authHeader - The Authorization header value (e.g., "Bearer sbf_...")
 * @returns The extracted token or null if invalid format
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1] ?? null;
}

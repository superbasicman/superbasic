/**
 * Personal Access Token (PAT) utilities
 *
 * Handles secure generation, hashing, and verification of API keys.
 * PATs are hashed using SHA-256 before storage; plaintext is shown only once on creation.
 */

import crypto from 'node:crypto';

/**
 * PAT prefix for easy identification and secret scanning
 */
const PAT_PREFIX = 'sbf_';

/**
 * Length of the random token portion (in bytes)
 * 32 bytes = 256 bits of entropy (NIST recommendation)
 */
const TOKEN_LENGTH = 32;

/**
 * Generate a new Personal Access Token
 *
 * Token format: sbf_<base64url>
 * - sbf_ prefix enables secret scanning in code repositories
 * - 32 bytes of entropy = 256 bits (cryptographically secure)
 * - base64url encoding (URL-safe, no padding)
 *
 * @returns Plaintext token (show once to user)
 */
export function generateToken(): string {
  const bytes = crypto.randomBytes(TOKEN_LENGTH);
  const base64url = bytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${PAT_PREFIX}${base64url}`;
}

/**
 * Hash token using SHA-256
 * Stored in database for verification
 *
 * @param token - The plaintext token
 * @returns SHA-256 hash as hex string
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verify token against stored hash using constant-time comparison
 * Prevents timing attacks
 *
 * @param token - The plaintext token from the Authorization header
 * @param hash - The stored SHA-256 hash from the database
 * @returns True if the token matches the hash
 */
export function verifyToken(token: string, hash: string): boolean {
  const tokenHash = hashToken(token);
  try {
    return crypto.timingSafeEqual(Buffer.from(tokenHash), Buffer.from(hash));
  } catch (error) {
    // timingSafeEqual throws if buffers have different lengths
    return false;
  }
}

/**
 * Validate token format
 * Returns true if token matches sbf_<base64url> pattern
 *
 * @param token - The token to validate
 * @returns True if the token has the correct format
 */
export function isValidTokenFormat(token: string): boolean {
  // Token should be: sbf_ (4 chars) + 43 base64url chars = 47 total
  // 32 bytes base64url encoded = 43 characters (no padding)
  return /^sbf_[A-Za-z0-9_-]{43}$/.test(token);
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

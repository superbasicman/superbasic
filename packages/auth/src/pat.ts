/**
 * Personal Access Token (PAT) utilities
 *
 * Handles secure generation, hashing, and verification of API keys.
 * PATs are hashed using SHA-256 before storage; plaintext is shown only once on creation.
 */

import {
  createOpaqueToken,
  createTokenHashEnvelope,
  parseOpaqueToken,
  verifyTokenSecret,
  type TokenHashEnvelope,
} from "./token-hash.js";

/**
 * PAT prefix for easy identification and secret scanning
 */
const PAT_PREFIX = "sbf";

/**
 * Length of the random token portion (in bytes)
 * 32 bytes = 256 bits of entropy (NIST recommendation)
 */
const TOKEN_LENGTH = 32;

/**
 * Generate a new Personal Access Token
 *
 * Token format: sbf_<tokenId>.<secret>
 * - sbf prefix enables secret scanning in code repositories
 * - tokenId is UUIDv4, secret is 32 bytes base64url
 *
 * @returns Plaintext token (show once to user)
 */
export function generateToken(): string {
  const opaque = createOpaqueToken({ secretLength: TOKEN_LENGTH, prefix: PAT_PREFIX });
  return opaque.value;
}

/**
 * Hash token using HMAC envelope
 * Stored in database for verification
 *
 * @param token - The plaintext token
 * @returns Hash envelope
 */
export function hashToken(token: string): TokenHashEnvelope {
  return createTokenHashEnvelope(token);
}

/**
 * Verify token against stored hash using constant-time comparison
 * Prevents timing attacks
 *
 * @param token - The plaintext token from the Authorization header
 * @param hash - The stored SHA-256 hash from the database
 * @returns True if the token matches the hash
 */
export function verifyToken(token: string, hash: TokenHashEnvelope): boolean {
  return verifyTokenSecret(token, hash);
}

/**
 * Validate token format
 * Returns true if token matches sbf_<uuid>.<secret> pattern
 *
 * @param token - The token to validate
 * @returns True if the token has the correct format
 */
export function isValidTokenFormat(token: string): boolean {
  const parsed = parseOpaqueToken(token, { expectedPrefix: PAT_PREFIX, allowLegacy: false });
  if (!parsed) {
    return false;
  }
  return /^[A-Za-z0-9_-]{43}$/.test(parsed.tokenSecret);
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

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }

  return parts[1] ?? null;
}

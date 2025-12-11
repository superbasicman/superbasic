/**
 * Session Transfer Token
 *
 * Short-lived, single-use opaque tokens for transferring authentication
 * from a native mobile app to the OAuth authorize endpoint.
 *
 * Flow:
 * 1. Mobile app authenticates via /v1/auth/signin/password
 * 2. Server creates session, returns session_transfer_token (not sessionId)
 * 3. Mobile opens OAuth authorize with session_token=<opaque token>
 * 4. Authorize validates/consumes token, finds session, issues auth code
 * 5. Normal OAuth flow continues (PKCE verification, token exchange)
 */

import {
  createOpaqueToken,
  createTokenHashEnvelope,
  parseOpaqueToken,
  verifyTokenSecret,
} from './token-hash.js';
import type { OpaqueToken, TokenHashEnvelope } from './token-hash.js';

// Prefix for session transfer tokens
const SESSION_TRANSFER_PREFIX = 'st';

// TTL in seconds (2 minutes - short enough to prevent replay, long enough for flow)
export const SESSION_TRANSFER_TTL_SECONDS = 120;

export interface SessionTransferTokenData {
  /** The opaque token value to send to the client */
  token: string;
  /** The token ID (UUID) for database storage */
  tokenId: string;
  /** Hash envelope for secure storage (never store the raw secret) */
  hashEnvelope: TokenHashEnvelope;
  /** When the token expires */
  expiresAt: Date;
}

/**
 * Generate a new session transfer token
 * Returns the opaque token value and the hash envelope for storage
 */
export function generateSessionTransferToken(): SessionTransferTokenData {
  const opaque: OpaqueToken = createOpaqueToken({ prefix: SESSION_TRANSFER_PREFIX });
  const hashEnvelope = createTokenHashEnvelope(opaque.tokenSecret);
  const expiresAt = new Date(Date.now() + SESSION_TRANSFER_TTL_SECONDS * 1000);

  return {
    token: opaque.value,
    tokenId: opaque.tokenId,
    hashEnvelope,
    expiresAt,
  };
}

export interface ParsedSessionTransferToken {
  tokenId: string;
  tokenSecret: string;
}

/**
 * Parse a session transfer token from the client
 * Returns null if the token is malformed or has wrong prefix
 */
export function parseSessionTransferToken(token: string): ParsedSessionTransferToken | null {
  const parsed = parseOpaqueToken(token, { expectedPrefix: SESSION_TRANSFER_PREFIX });
  if (!parsed) {
    return null;
  }
  return {
    tokenId: parsed.tokenId,
    tokenSecret: parsed.tokenSecret,
  };
}

/**
 * Verify the token secret against a stored hash envelope
 */
export function verifySessionTransferToken(
  tokenSecret: string,
  storedHashEnvelope: unknown
): boolean {
  return verifyTokenSecret(tokenSecret, storedHashEnvelope);
}

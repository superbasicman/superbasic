import * as Crypto from 'expo-crypto';

/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth 2.1
 * Uses expo-crypto for cryptographically secure random generation
 */

/**
 * Generate a cryptographically secure random string
 * @param length - Number of characters to generate
 * @returns Random string using unreserved characters (A-Z, a-z, 0-9, -, ., _, ~)
 */
export function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomBytes = Crypto.getRandomBytes(length);
  let result = '';

  for (let i = 0; i < length; i++) {
    const index = randomBytes[i]! % charset.length;
    result += charset.charAt(index);
  }

  return result;
}

/**
 * Generate SHA-256 hash and base64url encode it
 * @param verifier - Code verifier string
 * @returns Base64url-encoded SHA-256 hash (code challenge)
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  // Hash the verifier with SHA-256
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );

  // Convert base64 to base64url (RFC 4648 §5)
  return hash
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generate OAuth state parameter (32 characters)
 * Used to prevent CSRF attacks
 */
export function generateState(): string {
  return generateRandomString(32);
}

/**
 * Generate PKCE code verifier (64 characters)
 * Per RFC 7636: 43-128 characters from unreserved charset
 */
export function generateCodeVerifier(): string {
  return generateRandomString(64);
}

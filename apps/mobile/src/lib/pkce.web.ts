/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth 2.1 on web
 * Uses Web Crypto API (crypto.subtle) for cryptographically secure operations
 */

/**
 * Generate a cryptographically secure random string
 * @param length - Number of characters to generate
 * @returns Random string using unreserved characters (A-Z, a-z, 0-9, -, ., _, ~)
 */
export function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);

  let result = '';
  for (let i = 0; i < length; i++) {
    const index = randomValues[i]! % charset.length;
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
  // Encode the verifier as UTF-8
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);

  // Hash with SHA-256 using Web Crypto API
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert ArrayBuffer to base64
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const base64 = btoa(String.fromCharCode(...hashArray));

  // Convert base64 to base64url (RFC 4648 §5)
  return base64
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

/**
 * Token storage for web platform
 * Per auth-goal 5.2:
 * - Access token: in-memory only (not persisted)
 * - Refresh token: HttpOnly/Secure/SameSite cookie (not accessible to JS)
 *
 * The web client never has direct access to the refresh token.
 * Token refresh happens via credentials: 'include' which sends the cookie automatically.
 */

type StoredTokens = {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken?: string;
};

// In-memory storage (cleared on page reload)
let inMemoryAccessToken: string | null = null;
let inMemoryExpiry: number | null = null;

/**
 * Save tokens to memory
 * @param params.accessToken - JWT access token
 * @param params.expiresIn - Access token TTL in seconds (from server response)
 * @param params.refreshToken - Ignored on web (server sets HttpOnly cookie)
 */
export async function saveTokens(params: {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string; // Ignored - server sets HttpOnly cookie
}): Promise<void> {
  inMemoryAccessToken = params.accessToken;
  inMemoryExpiry = Date.now() + params.expiresIn * 1000;
  // Note: refreshToken is ignored - it's stored in HttpOnly cookie by server
}

/**
 * Get all stored tokens
 * Note: refreshToken is always undefined on web (in HttpOnly cookie)
 */
export async function getStoredTokens(): Promise<StoredTokens | null> {
  if (!inMemoryAccessToken || !inMemoryExpiry) {
    return null;
  }

  return {
    accessToken: inMemoryAccessToken,
    accessTokenExpiresAt: inMemoryExpiry,
    refreshToken: undefined, // Not accessible to JS
  };
}

/**
 * Get access token from memory
 */
export async function getAccessToken(): Promise<string | null> {
  return inMemoryAccessToken;
}

/**
 * Get access token expiry timestamp
 */
export async function getAccessTokenExpiry(): Promise<number | null> {
  return inMemoryExpiry;
}

/**
 * Get refresh token
 * Always returns null on web - refresh token is in HttpOnly cookie
 */
export async function getRefreshToken(): Promise<string | null> {
  return null; // HttpOnly cookie, not accessible to JS
}

/**
 * Check if the stored access token is still valid
 * Uses 60s buffer to account for clock skew and network latency
 */
export async function hasValidAccessToken(): Promise<boolean> {
  if (!inMemoryExpiry) return false;
  // 60s buffer to avoid using tokens that are about to expire
  return inMemoryExpiry > Date.now() + 60000;
}

/**
 * Clear all tokens from memory (logout)
 * Note: Server must also clear the HttpOnly refresh token cookie
 */
export async function clearTokens(): Promise<void> {
  inMemoryAccessToken = null;
  inMemoryExpiry = null;
  // Server must clear the HttpOnly cookie via Set-Cookie with Max-Age=0
}

/**
 * Update access token after refresh (implements token rotation)
 * @param params.accessToken - New access token
 * @param params.expiresIn - New TTL in seconds
 * @param params.refreshToken - Ignored on web (server rotates HttpOnly cookie)
 */
export async function updateTokensAfterRefresh(params: {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string; // Ignored - server rotates HttpOnly cookie
}): Promise<void> {
  // On web, refresh token rotation happens server-side via Set-Cookie
  await saveTokens(params);
}

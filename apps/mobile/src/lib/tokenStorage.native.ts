import * as SecureStore from 'expo-secure-store';

/**
 * Token storage for mobile using expo-secure-store
 * Stores both access tokens (short-lived: 10 min) and refresh tokens (long-lived: 30 days)
 * Implements refresh token rotation per OAuth 2.1 spec
 */

type StoredTokens = {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken?: string;
};

const ACCESS_TOKEN_KEY = 'sbf_access_token';
const ACCESS_TOKEN_EXPIRY_KEY = 'sbf_access_token_expires_at';
const REFRESH_TOKEN_KEY = 'sbf_refresh_token';

/**
 * Save tokens to secure storage
 * @param params.accessToken - JWT access token
 * @param params.expiresIn - Access token TTL in seconds (from server response)
 * @param params.refreshToken - Optional refresh token (for OAuth flow)
 */
export async function saveTokens(params: {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
}): Promise<void> {
  const expiresAt = Date.now() + params.expiresIn * 1000;

  try {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, params.accessToken);
    await SecureStore.setItemAsync(ACCESS_TOKEN_EXPIRY_KEY, expiresAt.toString());

    if (params.refreshToken) {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, params.refreshToken);
    }
  } catch (error) {
    console.error('Failed to save tokens to secure storage:', error);
    throw error;
  }
}

/**
 * Get all stored tokens
 */
export async function getStoredTokens(): Promise<StoredTokens | null> {
  try {
    const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    const expiryStr = await SecureStore.getItemAsync(ACCESS_TOKEN_EXPIRY_KEY);
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);

    if (!accessToken || !expiryStr) {
      return null;
    }

    const accessTokenExpiresAt = parseInt(expiryStr, 10);
    if (isNaN(accessTokenExpiresAt)) {
      return null;
    }

    return {
      accessToken,
      accessTokenExpiresAt,
      refreshToken: refreshToken ?? undefined,
    };
  } catch (error) {
    console.error('Failed to retrieve tokens from secure storage:', error);
    return null;
  }
}

/**
 * Get access token
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  } catch (error) {
    console.error('Failed to retrieve access token:', error);
    return null;
  }
}

/**
 * Get access token expiry timestamp
 */
export async function getAccessTokenExpiry(): Promise<number | null> {
  try {
    const expiryStr = await SecureStore.getItemAsync(ACCESS_TOKEN_EXPIRY_KEY);
    if (!expiryStr) return null;
    const expiry = parseInt(expiryStr, 10);
    return isNaN(expiry) ? null : expiry;
  } catch (error) {
    console.error('Failed to retrieve access token expiry:', error);
    return null;
  }
}

/**
 * Get refresh token
 */
export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error('Failed to retrieve refresh token:', error);
    return null;
  }
}

/**
 * Check if the stored access token is still valid
 * Uses 60s buffer to account for clock skew and network latency
 */
export async function hasValidAccessToken(): Promise<boolean> {
  try {
    const expiry = await getAccessTokenExpiry();
    if (!expiry) return false;
    // 60s buffer to avoid using tokens that are about to expire
    return expiry > Date.now() + 60000;
  } catch {
    return false;
  }
}

/**
 * Clear all tokens from secure storage (logout)
 */
export async function clearTokens(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_EXPIRY_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error('Failed to clear tokens from secure storage:', error);
    throw error;
  }
}

/**
 * Update access token after refresh (implements token rotation)
 * @param params.accessToken - New access token
 * @param params.expiresIn - New TTL in seconds
 * @param params.refreshToken - New refresh token (rotated)
 */
export async function updateTokensAfterRefresh(params: {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
}): Promise<void> {
  // Refresh token rotation: replace old refresh token with new one
  await saveTokens(params);
}

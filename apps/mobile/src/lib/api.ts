import type { LoginInput, RegisterInput, UserResponse } from '@repo/types';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  getAccessToken,
  getAccessTokenExpiry,
  getRefreshToken,
  saveTokens,
  clearTokens,
  updateTokensAfterRefresh,
} from './tokenStorage';

const IS_WEB = Platform.OS === 'web';

/**
 * API client for mobile app
 * Uses EXPO_PUBLIC_API_URL environment variable or defaults to localhost
 */

// Get API URL from Expo constants (uses EXPO_PUBLIC_API_URL env var)
const API_URL = (
  Constants.expoConfig?.extra?.apiUrl ||
  process.env.EXPO_PUBLIC_API_URL ||
  'http://localhost:3000'
).replace(/\/$/, '');

// Cached user from token response (avoid /v1/me call)
let cachedUser: UserResponse | null = null;

export function getCachedUser(): UserResponse | null {
  return cachedUser;
}

export function setCachedUser(user: UserResponse | null): void {
  cachedUser = user;
}

export function clearCachedUser(): void {
  cachedUser = null;
}

/**
 * API client error class for structured error handling
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
let refreshPromise: Promise<UserResponse | null> | null = null;

/**
 * Base fetch wrapper with auto-refresh and error handling
 * Mobile uses OAuth tokens (not cookies) so no credentials needed
 */
async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  await maybeRefreshAccessToken();

  const performRequest = async (token?: string | null) => {
    const headers = buildHeaders(options.headers, token);
    return fetch(url, {
      ...options,
      headers,
    });
  };

  let currentToken = await getAccessToken();
  let response = await performRequest(currentToken);

  if (response.status === 401 && currentToken) {
    try {
      await refreshAccessToken(true);
      currentToken = await getAccessToken();
      response = await performRequest(currentToken);
    } catch (error) {
      await clearTokens();
      clearCachedUser();
      throw new ApiError('Unauthorized', 401);
    }
  }

  if (response.status === 401) {
    throw new ApiError('Unauthorized', 401);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(data.error || 'An error occurred', response.status, data.details);
  }

  return data;
}

function buildHeaders(
  existing: RequestInit['headers'],
  accessToken?: string | null
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (existing instanceof Headers) {
    existing.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (Array.isArray(existing)) {
    existing.forEach(([key, value]) => {
      headers[key] = value;
    });
  } else if (existing) {
    Object.assign(headers, existing);
  }

  const hasAuthorization = Object.keys(headers).some(
    (key) => key.toLowerCase() === 'authorization'
  );

  if (accessToken && !hasAuthorization) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

async function maybeRefreshAccessToken() {
  const token = await getAccessToken();
  const expiresAt = await getAccessTokenExpiry();

  if (!token || !expiresAt) {
    return;
  }

  if (Date.now() + ACCESS_TOKEN_REFRESH_BUFFER_MS < expiresAt) {
    return;
  }

  await refreshAccessToken();
}

export async function refreshAccessToken(force = false): Promise<UserResponse | null> {
  if (refreshPromise && !force) {
    return refreshPromise;
  }
  refreshPromise = performAccessTokenRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function performAccessTokenRefresh(): Promise<UserResponse | null> {
  // Web: rely on HttpOnly refresh cookie and auth refresh endpoint
  if (IS_WEB) {
    const response = await fetch(`${API_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({}),
    });

    const data = await response.json().catch(() => null);

    if (response.status === 401) {
      await clearTokens();
      clearCachedUser();
      throw new ApiError('Refresh token expired or revoked', 401);
    }

    if (
      !response.ok ||
      !data ||
      typeof data.accessToken !== 'string' ||
      typeof data.expiresIn !== 'number'
    ) {
      await clearTokens();
      clearCachedUser();
      throw new ApiError('Unable to refresh session', response.status || 500);
    }

    await updateTokensAfterRefresh({
      accessToken: data.accessToken,
      expiresIn: data.expiresIn,
      refreshToken: data.refreshToken, // Ignored on web; stored via HttpOnly cookie
    });

    if (data.user?.id && data.user?.email && data.user?.createdAt) {
      const user: UserResponse = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name ?? null,
        createdAt: data.user.createdAt,
      };
      setCachedUser(user);
      return user;
    }

    return null;
  }

  // Mobile / native: refresh via OAuth token endpoint using secure-stored refresh token
  const refreshToken = await getRefreshToken();

  if (!refreshToken) {
    await clearTokens();
    clearCachedUser();
    throw new ApiError('No refresh token available', 401);
  }

  const response = await fetch(`${API_URL}/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: 'mobile-app',
    }).toString(),
  });

  const data = await response.json().catch(() => null);

  if (response.status === 401) {
    await clearTokens();
    clearCachedUser();
    throw new ApiError('Refresh token expired or revoked', 401);
  }

  if (
    !response.ok ||
    !data ||
    typeof data.access_token !== 'string' ||
    typeof data.expires_in !== 'number'
  ) {
    await clearTokens();
    clearCachedUser();
    throw new ApiError('Unable to refresh session', response.status || 500);
  }

  // OAuth 2.1 token rotation: update both access and refresh tokens
  await updateTokensAfterRefresh({
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    refreshToken: data.refresh_token, // New refresh token (rotated)
  });

  // Try to get user from cached data if available
  // Mobile apps should fetch /v1/me after refresh if user data is needed
  return null;
}

/**
 * Authentication API methods
 */
export const authApi = {
  /**
   * Login with email and password (establishes session via cookies)
   * Used as the entry point before OAuth authorize to obtain tokens.
   */
  async login(credentials: LoginInput): Promise<void> {
    const response = await fetch(`${API_URL}/v1/auth/signin/password`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(data.error || 'Invalid email or password', response.status || 401);
    }
  },

  /**
   * Register a new user
   * Returns requiresVerification: true when email verification is needed
   */
  async register(
    data: RegisterInput
  ): Promise<{ user: UserResponse; requiresVerification?: boolean; message?: string }> {
    return apiFetch('/v1/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get current user profile (requires Bearer token)
   */
  async me(): Promise<{ user: UserResponse }> {
    const response = await apiFetch<{
      user?: UserResponse & {
        profile?: {
          id: string;
          timezone: string;
          currency: string;
        } | null;
      };
    }>('/v1/me', {
      method: 'GET',
    });

    if (!response || !response.user) {
      throw new ApiError('Not authenticated', 401);
    }

    const { user } = response;

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
    };
  },

  /**
   * Logout - revokes tokens and clears local storage
   */
  async logout(): Promise<void> {
    try {
      // Attempt to revoke tokens on server
      await apiFetch('/v1/oauth/revoke', {
        method: 'POST',
        body: JSON.stringify({
          token: await getRefreshToken(),
          token_type_hint: 'refresh_token',
        }),
      });
    } catch (error) {
      // Ignore errors during logout - still clear local tokens
      console.warn('Failed to revoke tokens on server:', error);
    }
    await clearTokens();
    clearCachedUser();
  },
};

/**
 * Token API methods
 */
export const tokenApi = {
  /**
   * List all API tokens for the authenticated user
   */
  async list(): Promise<import('@repo/types').ListTokensResponse> {
    return apiFetch('/v1/tokens', {
      method: 'GET',
    });
  },

  /**
   * Create a new API token
   * Returns plaintext token (shown once only)
   */
  async create(
    data: import('@repo/types').CreateTokenRequest
  ): Promise<import('@repo/types').CreateTokenResponse> {
    return apiFetch('/v1/tokens', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Revoke an API token
   */
  async revoke(tokenId: string): Promise<void> {
    return apiFetch(`/v1/tokens/${tokenId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Update token name
   */
  async update(
    tokenId: string,
    data: import('@repo/types').UpdateTokenRequest
  ): Promise<import('@repo/types').TokenResponse> {
    return apiFetch(`/v1/tokens/${tokenId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
};

/**
 * Session management API methods
 */
export const sessionApi = {
  async list(): Promise<import('@repo/types').ListSessionsResponse> {
    return apiFetch('/v1/auth/sessions', {
      method: 'GET',
    });
  },

  async revoke(sessionId: string): Promise<void> {
    return apiFetch(`/v1/auth/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  },
};

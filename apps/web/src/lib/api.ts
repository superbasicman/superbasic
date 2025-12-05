import type { LoginInput, RegisterInput, UserResponse } from '@repo/types';
import { getAccessToken, getAccessTokenExpiry, saveTokens, clearTokens } from './tokenStorage';
import { getCookieValue } from './cookies';

// Remove trailing slash from API_URL to prevent double slashes
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

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
let refreshPromise: Promise<void> | null = null;
const REFRESH_CSRF_COOKIE = 'sb.refresh-csrf';

/**
 * Base fetch wrapper with credentials support, auto-refresh, and error handling
 */
async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  await maybeRefreshAccessToken();

  const performRequest = async (token?: string | null) => {
    const headers = buildHeaders(options.headers, token);
    return fetch(url, {
      ...options,
      credentials: options.credentials ?? 'include',
      headers,
    });
  };

  let currentToken = getAccessToken();
  let response = await performRequest(currentToken);

  if (response.status === 401 && currentToken) {
    try {
      await refreshAccessToken(true);
      currentToken = getAccessToken();
      response = await performRequest(currentToken);
    } catch (error) {
      clearTokens();
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
  const token = getAccessToken();
  const expiresAt = getAccessTokenExpiry();

  if (!token || !expiresAt) {
    return;
  }

  if (Date.now() + ACCESS_TOKEN_REFRESH_BUFFER_MS < expiresAt) {
    return;
  }

  await refreshAccessToken();
}

export async function refreshAccessToken(force = false) {
  if (refreshPromise && !force) {
    return refreshPromise;
  }
  refreshPromise = performAccessTokenRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function performAccessTokenRefresh() {
  const csrfToken = getCookieValue(REFRESH_CSRF_COOKIE);

  const response = await fetch(`${API_URL}/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: JSON.stringify({}),
  });

  const data = await response.json().catch(() => null);

  if (response.status === 401) {
    clearTokens();
    throw new ApiError('Unauthorized', 401);
  }

  if (
    !response.ok ||
    !data ||
    typeof data.accessToken !== 'string' ||
    typeof data.expiresIn !== 'number'
  ) {
    clearTokens();
    throw new ApiError('Unable to refresh session', response.status || 500);
  }

  saveTokens({
    accessToken: data.accessToken,
    expiresIn: data.expiresIn,
  });
}

/**
 * Authentication API methods
 */
export const authApi = {
  /**
   * Login with email and password (AuthCore-backed)
   * Hits Auth.js credentials callback; OAuth flow will follow to obtain tokens.
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
      throw new ApiError('Invalid email or password', response.status || 401);
    }
  },

  /**
   * Register a new user
   * Does NOT set session cookie - call login() after registration
   */
  async register(data: RegisterInput): Promise<{ user: UserResponse }> {
    return apiFetch('/v1/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Logout - revokes AuthCore session and clears tokens
   */
  async logout(): Promise<void> {
    const csrfToken = getCookieValue(REFRESH_CSRF_COOKIE);
    await apiFetch('/v1/auth/logout', {
      method: 'POST',
      headers: {
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
    });
    clearTokens();
  },

  /**
   * Send magic link to email
   */
  async sendMagicLink(email: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_URL}/v1/auth/magic-link/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(data.error || 'Failed to send magic link', response.status);
    }

    return response.json();
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

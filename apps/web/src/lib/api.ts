import type { LoginInput, RegisterInput, UserResponse } from '@repo/types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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

/**
 * Base fetch wrapper with credentials support and error handling
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    credentials: 'include', // Required for cross-origin cookie support
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // Handle 401 globally - will be caught by AuthContext
  if (response.status === 401) {
    throw new ApiError('Unauthorized', 401);
  }

  // Parse response body
  const data = await response.json().catch(() => ({}));

  // Handle non-2xx responses
  if (!response.ok) {
    throw new ApiError(
      data.error || 'An error occurred',
      response.status,
      data.details
    );
  }

  return data;
}

/**
 * Form-encoded POST helper for Auth.js endpoints
 * Auth.js expects application/x-www-form-urlencoded, not JSON
 */
async function apiFormPost<T>(
  endpoint: string,
  data: Record<string, string>
): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  // First, get CSRF token
  const csrfResponse = await fetch(`${API_URL}/v1/auth/csrf`, {
    credentials: 'include',
  });
  const csrfData = await csrfResponse.json();
  const csrfToken = csrfData.csrfToken;

  // Build form-encoded body with CSRF token
  const formData = new URLSearchParams({
    ...data,
    csrfToken,
  });

  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  // Handle 401 globally
  if (response.status === 401) {
    throw new ApiError('Unauthorized', 401);
  }

  // Auth.js may return 302 redirects for success
  // For our SPA, we'll treat redirects as success
  if (response.status === 302 || response.status === 200) {
    // Try to parse JSON response
    const text = await response.text();
    if (text) {
      try {
        return JSON.parse(text) as T;
      } catch {
        // If not JSON, return empty object
        return {} as T;
      }
    }
    return {} as T;
  }

  // Parse error response
  const errorData = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      errorData.error || 'An error occurred',
      response.status,
      errorData.details
    );
  }

  return errorData;
}

/**
 * Authentication API methods
 */
export const authApi = {
  /**
   * Login with email and password (Auth.js credentials provider)
   * Sets httpOnly cookie on success
   */
  async login(credentials: LoginInput): Promise<{ user: UserResponse }> {
    // Auth.js credentials endpoint expects form-encoded data
    await apiFormPost('/v1/auth/callback/credentials', {
      email: credentials.email,
      password: credentials.password,
    });

    // After successful login, fetch user session
    return this.me();
  },

  /**
   * Login with Google OAuth
   * Redirects to Google OAuth consent screen
   */
  loginWithGoogle(): void {
    // Redirect to Auth.js Google OAuth endpoint
    window.location.href = `${API_URL}/v1/auth/signin/google`;
  },

  /**
   * Request magic link via email
   * Sends magic link to user's email address
   */
  async requestMagicLink(email: string): Promise<void> {
    // Auth.js email provider expects form-encoded data
    await apiFormPost('/v1/auth/signin/nodemailer', {
      email,
    });
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
   * Logout - clears httpOnly cookie (Auth.js signout)
   */
  async logout(): Promise<void> {
    await apiFormPost('/v1/auth/signout', {});
  },

  /**
   * Get current user session (Auth.js session endpoint)
   * Requires valid session cookie
   */
  async me(): Promise<{ user: UserResponse }> {
    const response = await apiFetch<{ user?: UserResponse }>('/v1/auth/session', {
      method: 'GET',
    });

    // Auth.js returns null for no session
    if (!response.user) {
      throw new ApiError('Not authenticated', 401);
    }

    return { user: response.user };
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

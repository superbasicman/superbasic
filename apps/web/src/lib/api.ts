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
 * Authentication API methods
 */
export const authApi = {
  /**
   * Login with email and password
   * Sets httpOnly cookie on success
   */
  async login(credentials: LoginInput): Promise<{ user: UserResponse }> {
    return apiFetch('/v1/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
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
   * Logout - clears httpOnly cookie
   */
  async logout(): Promise<void> {
    return apiFetch('/v1/logout', {
      method: 'POST',
    });
  },

  /**
   * Get current user profile
   * Requires valid session cookie
   */
  async me(): Promise<{ user: UserResponse }> {
    return apiFetch('/v1/me', {
      method: 'GET',
    });
  },
};

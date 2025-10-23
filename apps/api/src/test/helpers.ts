/**
 * HTTP test helpers for integration tests
 * Provides utilities for making requests to Hono app and handling cookies
 */

import type { Hono } from 'hono';
import { hashPassword } from '@repo/auth';
import { getTestPrisma } from './setup.js';

/**
 * Request options for test helpers
 */
export interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}

/**
 * Make an HTTP request to the Hono app
 * 
 * @param app - Hono application instance
 * @param method - HTTP method (GET, POST, etc.)
 * @param path - Request path (e.g., '/v1/login')
 * @param options - Request options (body, headers, cookies)
 * @returns Response object
 */
export async function makeRequest(
  app: Hono<any>,
  method: string,
  path: string,
  options: RequestOptions = {}
): Promise<Response> {
  const { body, headers = {}, cookies = {} } = options;

  // Build cookie header from cookies object
  const cookieHeader = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  // Build request init
  const init: RequestInit = {
    method: method.toUpperCase(),
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body !== undefined) {
    // If body is already a string (e.g., form-encoded), use it directly
    // Otherwise, JSON stringify it
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  // Make request to Hono app
  const request = new Request(`http://localhost${path}`, init);
  return app.fetch(request);
}

/**
 * Make an authenticated HTTP request with session cookie
 * 
 * @param app - Hono application instance
 * @param method - HTTP method (GET, POST, etc.)
 * @param path - Request path (e.g., '/v1/me')
 * @param sessionCookie - Session cookie value (JWT token)
 * @param options - Additional request options
 * @returns Response object
 */
export async function makeAuthenticatedRequest(
  app: Hono<any>,
  method: string,
  path: string,
  sessionCookie: string,
  options: RequestOptions = {}
): Promise<Response> {
  // Import COOKIE_NAME dynamically to get the correct environment-specific name
  const { COOKIE_NAME } = await import('@repo/auth');
  
  const cookies = {
    ...options.cookies,
    [COOKIE_NAME]: sessionCookie,
  };

  return makeRequest(app, method, path, {
    ...options,
    cookies,
  });
}

/**
 * Extract a cookie value from response headers
 * 
 * @param response - Response object
 * @param name - Cookie name to extract
 * @returns Cookie value or null if not found
 */
export function extractCookie(response: Response, name: string): string | null {
  const setCookieHeaders = response.headers.getSetCookie?.() || [];
  
  for (const header of setCookieHeaders) {
    const match = header.match(new RegExp(`${name}=([^;]+)`));
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Get CSRF token from Auth.js for testing credentials sign-in
 * 
 * @param app - Hono application instance
 * @returns Object with csrfToken and cookie
 */
export async function getAuthJsCSRFToken(
  app: Hono<any>
): Promise<{ csrfToken: string; csrfCookie: string }> {
  const response = await makeRequest(app, 'GET', '/v1/auth/csrf');
  
  if (response.status !== 200) {
    throw new Error(`Failed to get CSRF token: ${response.status}`);
  }

  const data = await response.json();
  const csrfCookie = extractCookie(response, '__Host-authjs.csrf-token') || 
                     extractCookie(response, 'authjs.csrf-token');
  
  if (!data.csrfToken || !csrfCookie) {
    throw new Error('CSRF token or cookie not found in response');
  }

  return {
    csrfToken: data.csrfToken,
    csrfCookie,
  };
}

/**
 * Post form data to Auth.js endpoint with CSRF token (generic helper)
 * 
 * @param app - Hono application instance
 * @param path - Auth.js endpoint path (e.g., '/v1/auth/callback/credentials')
 * @param formData - Form data to post (will be merged with CSRF token)
 * @returns Response object
 * 
 * @example
 * // Sign in with credentials
 * const response = await postAuthJsForm(app, '/v1/auth/callback/credentials', {
 *   email: 'user@example.com',
 *   password: 'password123'
 * });
 * 
 * @example
 * // Request magic link
 * const response = await postAuthJsForm(app, '/v1/auth/signin/email', {
 *   email: 'user@example.com'
 * });
 */
export async function postAuthJsForm(
  app: Hono<any>,
  path: string,
  formData: Record<string, string>
): Promise<Response> {
  // Get CSRF token
  const { csrfToken, csrfCookie } = await getAuthJsCSRFToken(app);

  // Build form data with CSRF token
  const formParams = new URLSearchParams({
    ...formData,
    csrfToken,
  });

  // Make request with CSRF cookie
  return makeRequest(app, 'POST', path, {
    body: formParams.toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    cookies: {
      '__Host-authjs.csrf-token': csrfCookie,
      'authjs.csrf-token': csrfCookie, // Fallback for non-HTTPS
    },
  });
}

/**
 * Sign in with credentials using Auth.js (handles CSRF automatically)
 * 
 * @param app - Hono application instance
 * @param email - User email
 * @param password - User password
 * @returns Response object
 */
export async function signInWithCredentials(
  app: Hono<any>,
  email: string,
  password: string
): Promise<Response> {
  return postAuthJsForm(app, '/v1/auth/callback/credentials', {
    email,
    password,
  });
}

/**
 * Test user credentials for factories
 */
export interface TestUserCredentials {
  email: string;
  password: string;
  name?: string | undefined;
}

/**
 * Create test user credentials with unique email
 * 
 * @param overrides - Optional overrides for default values
 * @returns Test user credentials
 */
export function createTestUserCredentials(
  overrides: Partial<TestUserCredentials> = {}
): TestUserCredentials {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  
  return {
    email: overrides.email || `test-${timestamp}-${random}@example.com`,
    password: overrides.password || 'Test1234!',
    name: overrides.name ?? undefined,
  };
}

/**
 * Create a test user in the database with profile
 * 
 * @param overrides - Optional overrides for user data
 * @returns Created user object with profile
 */
export async function createTestUser(
  overrides: Partial<TestUserCredentials> = {}
) {
  const credentials = createTestUserCredentials(overrides);
  const prisma = getTestPrisma();

  const hashedPassword = await hashPassword(credentials.password);

  // Create user and profile in a transaction (matching register endpoint behavior)
  const result = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: credentials.email,
        password: hashedPassword,
        name: credentials.name || null,
      },
    });

    // Create profile with default settings
    const newProfile = await tx.profile.create({
      data: {
        userId: newUser.id,
        timezone: 'UTC',
        currency: 'USD',
      },
    });

    return { user: newUser, profile: newProfile };
  });

  return {
    user: { ...result.user, profile: result.profile },
    credentials, // Return plaintext password for testing login
  };
}

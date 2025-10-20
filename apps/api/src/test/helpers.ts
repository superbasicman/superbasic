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
    init.body = JSON.stringify(body);
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

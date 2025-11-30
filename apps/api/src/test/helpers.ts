/**
 * HTTP test helpers for integration tests
 * Provides utilities for making requests to Hono app and handling cookies
 */

import type { Hono } from 'hono';
import {
  hashPassword,
  createTokenHashEnvelope,
  createOpaqueToken,
  SESSION_MAX_AGE_SECONDS,
  SESSION_ABSOLUTE_MAX_AGE_SECONDS,
  AUTHJS_CREDENTIALS_PROVIDER_ID,
} from '@repo/auth';
import type { PermissionScope } from '@repo/auth-core';
import { generateAccessToken } from '@repo/auth-core';
import { authService } from '../lib/auth-service.js';
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
 * Make an authenticated HTTP request with a Bearer access token.
 */
export async function makeAuthenticatedRequest(
  app: Hono<any>,
  method: string,
  path: string,
  accessToken: string,
  options: RequestOptions = {}
): Promise<Response> {
  return makeRequest(app, method, path, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
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
 * @param path - Auth.js endpoint path (e.g., '/v1/auth/callback/authjs%3Acredentials')
 * @param formData - Form data to post (will be merged with CSRF token)
 * @returns Response object
 * 
 * @example
 * // Sign in with credentials
 * const response = await postAuthJsForm(app, '/v1/auth/callback/authjs%3Acredentials', {
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
  return postAuthJsForm(
    app,
    `/v1/auth/callback/${AUTHJS_CREDENTIALS_PROVIDER_ID}`,
    {
      email,
      password,
    }
  );
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
  const normalizedEmail = credentials.email.toLowerCase();

  // Create user and profile sequentially (avoid long-running interactive transactions in tests)
  const newUser = await prisma.user.create({
    data: {
      email: credentials.email,
      emailLower: normalizedEmail,
      password: hashedPassword,
      name: credentials.name || null,
    },
  });

  const newProfile = await prisma.profile.create({
    data: {
      userId: newUser.id,
      timezone: 'UTC',
      currency: 'USD',
    },
  });

  return {
    user: { ...newUser, profile: newProfile },
    credentials, // Return plaintext password for testing login
  };
}

/**
 * Create a persisted Auth.js session token for the given user.
 *
 * @param userId - ID of the user who owns the session
 * @param _email - Unused (kept for backward compatibility with existing helpers)
 * @param options - Optional overrides for expiration
 * @returns Session token string to be used as cookie value
 */
function ensureTokenHashKeys() {
  if (!process.env.TOKEN_HASH_KEYS) {
    const fallback =
      process.env.TOKEN_HASH_FALLBACK_SECRET ||
      process.env.AUTH_SECRET ||
      'test_token_hash_secret_for_vitest';
    process.env.TOKEN_HASH_KEYS = JSON.stringify({ v1: fallback });
    process.env.TOKEN_HASH_ACTIVE_KEY_ID ??= 'v1';
  }
}

function computeSessionTimestamps(expiresInSeconds: number) {
  const now = new Date();
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
  const absoluteExpiresAt = new Date(
    now.getTime() + SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1000
  );
  return { now, expiresAt, absoluteExpiresAt };
}

export async function createSessionToken(
  userId: string,
  _email?: string,
  options: { expiresInSeconds?: number } = {}
) {
  ensureTokenHashKeys();
  const prisma = getTestPrisma();
  const opaqueToken = createOpaqueToken();
  const expiresInSeconds = options.expiresInSeconds ?? SESSION_MAX_AGE_SECONDS;
  const { now, expiresAt, absoluteExpiresAt } = computeSessionTimestamps(
    expiresInSeconds
  );

  await prisma.session.create({
    data: {
      userId,
      tokenId: opaqueToken.tokenId,
      sessionTokenHash: createTokenHashEnvelope(opaqueToken.tokenSecret),
      expiresAt,
      clientType: 'web',
      kind: 'default',
      lastUsedAt: now,
      absoluteExpiresAt,
    },
  });

  return opaqueToken.value;
}

export async function createSessionRecord(
  userId: string,
  options: { expiresInSeconds?: number } = {}
) {
  ensureTokenHashKeys();
  const prisma = getTestPrisma();
  const expiresInSeconds = options.expiresInSeconds ?? SESSION_MAX_AGE_SECONDS;
  const { now, expiresAt, absoluteExpiresAt } = computeSessionTimestamps(
    expiresInSeconds
  );
  const opaqueToken = createOpaqueToken();

  return prisma.session.create({
    data: {
      userId,
      tokenId: opaqueToken.tokenId,
      sessionTokenHash: createTokenHashEnvelope(opaqueToken.tokenSecret),
      expiresAt,
      clientType: 'web',
      kind: 'default',
      lastUsedAt: now,
      absoluteExpiresAt,
    },
  });
}

export async function createAccessToken(
  userId: string,
  options: { expiresInSeconds?: number } = {}
) {
  const session = await createSessionRecord(userId, options);
  const { token } = await generateAccessToken({
    userId,
    sessionId: session.id,
    clientType: session.clientType,
  });

  return { token, session };
}

export async function createPersonalAccessToken(options: {
  userId: string;
  email?: string;
  profileId?: string | null;
  scopes: string[];
  workspaceId?: string | null;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  name?: string;
}) {
  ensureTokenHashKeys();

  // When tests use VITEST_MOCK_DATABASE, authService runs against the mocked
  // @repo/database prisma instance, not the real test Prisma used in setup.
  // Ensure the user/profile/workspace exist in that prisma so auth-core can resolve context.
  try {
    const { prisma: authPrisma } = await import('@repo/database');
    const existingUser = await authPrisma.user.findUnique({ where: { id: options.userId } });
    const email = options.email ?? `pat-mock-${options.userId}@example.com`;
    if (!existingUser) {
      await authPrisma.user.create({
        data: {
          id: options.userId,
          email,
          emailLower: email.toLowerCase(),
          status: 'active',
        },
      });
    }
    const profileId = options.profileId ?? null;
    if (profileId) {
      const existingProfile = await authPrisma.profile.findUnique({ where: { id: profileId } });
      if (!existingProfile) {
        await authPrisma.profile.create({
          data: {
            id: profileId,
            userId: options.userId,
            timezone: 'UTC',
            currency: 'USD',
          },
        });
      }
    }
    if (options.workspaceId) {
      const workspaceExists = await (authPrisma as any)?.workspace?.findUnique?.({
        where: { id: options.workspaceId },
      });
      if (!workspaceExists) {
        const ownerProfileId =
          profileId ??
          (
            await authPrisma.profile.create({
              data: {
                userId: options.userId,
                timezone: 'UTC',
                currency: 'USD',
              },
            })
          ).id;
        await (authPrisma as any).workspace.create({
          data: {
            id: options.workspaceId,
            name: 'Workspace Token',
            ownerProfileId,
          },
        });
        await authPrisma.workspaceMember.create({
          data: {
            workspaceId: options.workspaceId,
            memberProfileId: ownerProfileId,
            role: 'owner',
          },
        });
      } else if (profileId) {
        await authPrisma.workspaceMember.create({
          data: {
            workspaceId: options.workspaceId,
            memberProfileId: profileId,
            role: 'owner',
          },
        });
      }
    }
  } catch {
    // best-effort: if mocked prisma not available, continue and let auth-core use the real DB
  }

  const issued = await authService.issuePersonalAccessToken({
    userId: options.userId,
    scopes: options.scopes as PermissionScope[],
    workspaceId: options.workspaceId ?? null,
    name: options.name ?? 'Test PAT',
    expiresAt: options.expiresAt ?? null,
  });
  // Ensure scopes are persisted for tests even if mocks/prisma layers diverge
  try {
    const prisma = getTestPrisma();
    const requestedScopes = options.scopes as PermissionScope[];
    const stored = await prisma.token.findUnique({
      where: { id: issued.tokenId },
      select: { scopes: true },
    });
    const scopesMatch =
      stored?.scopes?.length === requestedScopes.length &&
      requestedScopes.every((scope) => stored?.scopes?.includes(scope));
    if (!scopesMatch) {
      await prisma.token.update({
        where: { id: issued.tokenId },
        data: { scopes: requestedScopes },
      });
    }
  } catch {
    // best-effort; if test prisma not available, fall back to the auth prisma
    try {
      const { prisma } = await import('@repo/database');
      await prisma.token.update({
        where: { id: issued.tokenId },
        data: { scopes: options.scopes as PermissionScope[] },
      });
    } catch {
      // ignore if unreachable
    }
  }
  // Optional debug trace for PAT issuance when running with VITEST_DEBUG_PAT
  // Intentionally silent during normal runs.

  if (options.revokedAt) {
    const updateData = { where: { id: issued.tokenId }, data: { revokedAt: options.revokedAt } };
    try {
      const prisma = getTestPrisma();
      await prisma.token.update(updateData);
    } catch {
      try {
        const { prisma } = await import('@repo/database');
        await prisma.token.update(updateData as any);
      } catch {
        // If neither real nor mocked Prisma is available, skip the revocation stamp
      }
    }
  }

  return { token: issued.secret, tokenId: issued.tokenId };
}

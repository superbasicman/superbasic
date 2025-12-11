/**
 * HTTP test helpers for integration tests
 * Provides utilities for making requests to Hono app and handling cookies
 */

import { SESSION_MAX_AGE_SECONDS, hashPassword } from '@repo/auth';
import { createOpaqueToken } from '@repo/auth-core';
import type { ClientType, MfaLevel, PermissionScope } from '@repo/auth-core';
import { generateAccessToken } from '@repo/auth-core';
import type { Prisma } from '@repo/database';
import type { Env, Hono } from 'hono';
import { authService } from '../lib/auth-service.js';
import { getTestPrisma } from './setup.js';

/**
 * Request options for test helpers
 */
export interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  env?: Record<string, unknown>;
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
export async function makeRequest<E extends Env>(
  app: Hono<E>,
  method: string,
  path: string,
  options: RequestOptions = {}
): Promise<Response> {
  const { body, headers = {}, cookies = {}, env } = options;

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
  return app.fetch(request, env as Record<string, unknown> | undefined);
}

/**
 * Make an authenticated HTTP request with a Bearer access token.
 */
export async function makeAuthenticatedRequest<E extends Env>(
  app: Hono<E>,
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
    if (match?.[1]) {
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
export async function createTestUser(overrides: Partial<TestUserCredentials> = {}) {
  const credentials = createTestUserCredentials(overrides);
  const prisma = getTestPrisma();

  const hashedPassword = await hashPassword(credentials.password);

  // Create user and profile sequentially (avoid long-running interactive transactions in tests)
  const newUser = await prisma.user.create({
    data: {
      primaryEmail: credentials.email,
      displayName: credentials.name || null,
      userState: 'active',
      emailVerified: true, // Test users are verified by default
      password: {
        create: {
          passwordHash: hashedPassword,
        },
      },
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
    user: { ...newUser, profile: newProfile, email: newUser.primaryEmail },
    credentials, // Return plaintext password for testing login
  };
}

// Create a persisted session token for the given user (auth-core helper).
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
  return { now, expiresAt };
}

async function ensureWorkspaceMembership(userId: string) {
  const prisma = getTestPrisma();
  const existingMembership = await prisma.workspaceMember.findFirst({
    where: {
      userId,
      revokedAt: null,
    },
  });

  if (existingMembership) {
    return existingMembership.workspaceId;
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: 'Test Workspace',
      slug: `test-workspace-${userId}-${Date.now()}`,
      ownerUserId: userId,
    },
  });

  await prisma.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId,
      role: 'owner',
    },
  });

  return workspace.id;
}

export async function createTestWorkspace(userId: string, overrides: { name?: string } = {}) {
  const prisma = getTestPrisma();
  const workspace = await prisma.workspace.create({
    data: {
      name: overrides.name ?? 'Test Workspace',
      slug: `test-workspace-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ownerUserId: userId,
    },
  });

  await prisma.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId,
      role: 'owner',
    },
  });

  return workspace;
}

export async function createSessionToken(
  userId: string,
  _email?: string,
  options: { expiresInSeconds?: number } = {}
) {
  ensureTokenHashKeys();
  const prisma = getTestPrisma();
  const expiresInSeconds = options.expiresInSeconds ?? SESSION_MAX_AGE_SECONDS;
  const { now, expiresAt } = computeSessionTimestamps(expiresInSeconds);
  const opaqueToken = createOpaqueToken();

  await prisma.authSession.create({
    data: {
      userId,
      expiresAt,
      clientInfo: { type: 'web' },
      lastActivityAt: now,
      mfaLevel: 'none',
    },
  });

  return opaqueToken.value;
}

export async function createSessionRecord(
  userId: string,
  options: { expiresInSeconds?: number; mfaLevel?: MfaLevel } = {}
) {
  ensureTokenHashKeys();
  const prisma = getTestPrisma();
  const expiresInSeconds = options.expiresInSeconds ?? SESSION_MAX_AGE_SECONDS;
  const { now, expiresAt } = computeSessionTimestamps(expiresInSeconds);

  return prisma.authSession.create({
    data: {
      userId,
      expiresAt,
      clientInfo: { type: 'web' },
      lastActivityAt: now,
      mfaLevel: options.mfaLevel ?? 'mfa',
    },
  });
}

export async function createAccessToken(
  userId: string,
  options: { expiresInSeconds?: number; ensureWorkspace?: boolean; mfaLevel?: MfaLevel } = {}
) {
  if (options.ensureWorkspace !== false) {
    await ensureWorkspaceMembership(userId);
  }
  const sessionOptions: { expiresInSeconds?: number; mfaLevel?: MfaLevel } = {};
  if (options.expiresInSeconds !== undefined) {
    sessionOptions.expiresInSeconds = options.expiresInSeconds;
  }
  if (options.mfaLevel) {
    sessionOptions.mfaLevel = options.mfaLevel;
  }
  const session = await createSessionRecord(userId, sessionOptions);
  const { token } = await generateAccessToken({
    userId,
    sessionId: session.id,
    clientType: ((session.clientInfo as { type?: string | null } | null)?.type ??
      'web') as ClientType,
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
          primaryEmail: email,
          userState: 'active',
          emailVerified: true, // Test users are verified by default
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
      type WorkspaceClient = {
        workspace?: {
          findUnique?: (args: { where: { id: string } }) => Promise<{ id: string } | null>;
          create?: (args: {
            data: { id: string; name: string; ownerUserId: string };
          }) => Promise<unknown>;
        };
        workspaceMember?: {
          create?: (args: {
            data: { workspaceId: string; userId: string; role: string };
          }) => Promise<unknown>;
        };
      };
      const workspaceClient = authPrisma as unknown as WorkspaceClient;

      const workspaceExists = await workspaceClient.workspace?.findUnique?.({
        where: { id: options.workspaceId },
      });
      if (!workspaceExists) {
        const ownerProfile =
          profileId !== null
            ? await authPrisma.profile.findUnique({ where: { id: profileId } })
            : null;
        const ensuredProfile =
          ownerProfile ??
          (await authPrisma.profile.create({
            data: {
              userId: options.userId,
              timezone: 'UTC',
              currency: 'USD',
            },
          }));
        await workspaceClient.workspace?.create?.({
          data: {
            id: options.workspaceId,
            name: 'Workspace Token',
            ownerUserId: options.userId,
          },
        });
        await workspaceClient.workspaceMember?.create?.({
          data: {
            workspaceId: options.workspaceId,
            userId: ensuredProfile.userId,
            role: 'owner',
          },
        });
      } else if (profileId) {
        await authPrisma.workspaceMember.create({
          data: {
            workspaceId: options.workspaceId,
            userId: options.userId,
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
  // Optional debug trace for PAT issuance when running with VITEST_DEBUG_PAT
  // Intentionally silent during normal runs.

  if (options.revokedAt) {
    const updateData: Prisma.ApiKeyUpdateArgs = {
      where: { id: issued.tokenId },
      data: { revokedAt: options.revokedAt },
    };
    try {
      const prisma = getTestPrisma();
      await prisma.apiKey.update(updateData);
    } catch {
      try {
        const { prisma } = await import('@repo/database');
        await prisma.apiKey.update(updateData);
      } catch {
        // If neither real nor mocked Prisma is available, skip the revocation stamp
      }
    }
  }

  return { token: issued.secret, tokenId: issued.tokenId };
}

export async function getRefreshToken(id: string) {
  const prisma = getTestPrisma();
  return prisma.refreshToken.findUnique({ where: { id } });
}

export async function getAuthSession(id: string) {
  const prisma = getTestPrisma();
  return prisma.authSession.findUnique({ where: { id } });
}

export async function updateRefreshToken(id: string, data: { revokedAt: Date }) {
  const prisma = getTestPrisma();
  return prisma.refreshToken.update({
    where: { id },
    data,
  });
}

export async function getUser(id: string) {
  const prisma = getTestPrisma();
  return prisma.user.findUnique({ where: { id } });
}

export async function getUserPassword(userId: string) {
  const prisma = getTestPrisma();
  return prisma.userPassword.findUnique({ where: { userId } });
}

export async function getAllActiveSessionIdsForUser(userId: string) {
  const prisma = getTestPrisma();
  const sessions = await prisma.authSession.findMany({
    where: {
      userId,
      revokedAt: null,
    },
    select: { id: true },
  });
  return sessions.map((s) => s.id);
}

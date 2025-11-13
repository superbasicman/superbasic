/**
 * Integration tests for GET /v1/me endpoint
 * Tests session validation and user profile retrieval with Auth.js sessions
 * 
 * Note: Migrated to use Auth.js session management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Unmock @repo/database for integration tests (use real Prisma client)
vi.unmock('@repo/database');

import app from '../../../app.js';
import { resetDatabase, getTestPrisma } from '../../../test/setup.js';
import {
  makeRequest,
  createTestUser,
  extractCookie,
  signInWithCredentials,
  createSessionToken,
} from '../../../test/helpers.js';

// Auth.js uses this cookie name
const COOKIE_NAME = 'authjs.session-token';

describe('GET /v1/me', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('Session Validation Success', () => {
    it('should return 200 with user profile for valid Auth.js session cookie', async () => {
      // Create test user and sign in to get session
      const { user, credentials } = await createTestUser({
        name: 'Test User',
      });

      const signInResponse = await signInWithCredentials(
        app,
        credentials.email,
        credentials.password
      );

      expect(signInResponse.status).toBe(302);

      // Extract session cookie
      const sessionCookie = extractCookie(signInResponse, COOKIE_NAME);
      expect(sessionCookie).toBeTruthy();

      // Make authenticated request to /v1/me
      const response = await makeRequest(app, 'GET', '/v1/me', {
        cookies: {
          [COOKIE_NAME]: sessionCookie!,
        },
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('user');
      expect(data.user).toMatchObject({
        id: user.id,
        email: user.email,
        name: user.name,
      });
      expect(data.user).toHaveProperty('createdAt');
      expect(data.user).not.toHaveProperty('password');
    });

    it('should return user profile with null name if not set', async () => {
      const { credentials } = await createTestUser();

      const signInResponse = await signInWithCredentials(
        app,
        credentials.email,
        credentials.password
      );

      const sessionCookie = extractCookie(signInResponse, COOKIE_NAME);

      const response = await makeRequest(app, 'GET', '/v1/me', {
        cookies: {
          [COOKIE_NAME]: sessionCookie!,
        },
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.user.name).toBeNull();
    });

    it('should return correct user data for multiple users', async () => {
      // Create two users
      const { user: user1, credentials: creds1 } = await createTestUser({
        name: 'User One',
      });
      const { user: user2, credentials: creds2 } = await createTestUser({
        name: 'User Two',
      });

      // Sign in as first user
      const signIn1 = await signInWithCredentials(
        app,
        creds1.email,
        creds1.password
      );
      const session1 = extractCookie(signIn1, COOKIE_NAME);

      // Sign in as second user
      const signIn2 = await signInWithCredentials(
        app,
        creds2.email,
        creds2.password
      );
      const session2 = extractCookie(signIn2, COOKIE_NAME);

      // Verify each session returns correct user
      const response1 = await makeRequest(app, 'GET', '/v1/me', {
        cookies: {
          [COOKIE_NAME]: session1!,
        },
      });
      const data1 = await response1.json();
      expect(data1.user.id).toBe(user1.id);
      expect(data1.user.email).toBe(user1.email);

      const response2 = await makeRequest(app, 'GET', '/v1/me', {
        cookies: {
          [COOKIE_NAME]: session2!,
        },
      });
      const data2 = await response2.json();
      expect(data2.user.id).toBe(user2.id);
      expect(data2.user.email).toBe(user2.email);
    });
  });

  describe('Session Validation Failure', () => {
    it('should return 401 when no session cookie is provided', async () => {
      const response = await makeRequest(app, 'GET', '/v1/me');

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 for invalid session cookie', async () => {
      const invalidToken = 'invalid.jwt.token';

      const response = await makeRequest(app, 'GET', '/v1/me', {
        cookies: {
          [COOKIE_NAME]: invalidToken,
        },
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 for malformed JWT', async () => {
      const malformedToken = 'not-a-jwt';

      const response = await makeRequest(app, 'GET', '/v1/me', {
        cookies: {
          [COOKIE_NAME]: malformedToken,
        },
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 401 for expired session cookie', async () => {
      const { user } = await createTestUser();

      const expiredToken = await createSessionToken(user.id, user.email, {
        expiresInSeconds: -3600,
      });

      const response = await makeRequest(app, 'GET', '/v1/me', {
        cookies: {
          [COOKIE_NAME]: expiredToken,
        },
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 for tampered session tokens', async () => {
      const { user } = await createTestUser();

      const validToken = await createSessionToken(user.id, user.email);
      const tampered = `${validToken}tampered`;

      const response = await makeRequest(app, 'GET', '/v1/me', {
        cookies: {
          [COOKIE_NAME]: tampered,
        },
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 401 for malformed session tokens', async () => {
      const response = await makeRequest(app, 'GET', '/v1/me', {
        cookies: {
          [COOKIE_NAME]: 'invalid-token-value',
        },
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 404 when profile for authenticated user is missing', async () => {
      const { user } = await createTestUser();
      const token = await createSessionToken(user.id, user.email);
      const prisma = getTestPrisma();

      await prisma.profile.deleteMany({ where: { userId: user.id } });

      const response = await makeRequest(app, 'GET', '/v1/me', {
        cookies: {
          [COOKIE_NAME]: token,
        },
      });

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('Session Cookie Attributes', () => {
    it('should accept Auth.js session cookie with correct name', async () => {
      const { credentials } = await createTestUser();

      const signInResponse = await signInWithCredentials(
        app,
        credentials.email,
        credentials.password
      );

      const sessionCookie = extractCookie(signInResponse, COOKIE_NAME);
      expect(sessionCookie).toBeTruthy();

      // Verify the cookie name is correct
      const setCookieHeaders = signInResponse.headers.getSetCookie?.() || [];
      const cookieHeader = setCookieHeaders.find((h) => h.includes(COOKIE_NAME));
      expect(cookieHeader).toBeTruthy();
    });

    it('should work with cookies that have additional attributes', async () => {
      const { credentials } = await createTestUser();

      const signInResponse = await signInWithCredentials(
        app,
        credentials.email,
        credentials.password
      );

      const sessionCookie = extractCookie(signInResponse, COOKIE_NAME);

      // Make request with cookie that includes attributes (simulating browser behavior)
      const response = await makeRequest(app, 'GET', '/v1/me', {
        cookies: {
          [COOKIE_NAME]: sessionCookie!,
        },
      });

      expect(response.status).toBe(200);
    });
  });
});

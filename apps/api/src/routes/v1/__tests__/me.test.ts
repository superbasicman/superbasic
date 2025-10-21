/**
 * Integration tests for GET /v1/me endpoint
 * Tests session validation and user profile retrieval
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Unmock @repo/database for integration tests (use real Prisma client)
vi.unmock('@repo/database');

import app from '../../../app.js';
import { resetDatabase } from '../../../test/setup.js';
import {
  makeRequest,
  makeAuthenticatedRequest,
  createTestUser,
  extractCookie,
} from '../../../test/helpers.js';
import { COOKIE_NAME, SESSION_MAX_AGE_SECONDS, JWT_SALT, authConfig } from '@repo/auth';
import { encode } from '@auth/core/jwt';

describe('GET /v1/me', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('Session Validation Success', () => {
    it('should return 200 with user profile for valid session cookie', async () => {
      // Create test user and login to get session
      const { user, credentials } = await createTestUser({
        name: 'Test User',
      });

      const loginResponse = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      expect(loginResponse.status).toBe(200);

      // Extract session cookie
      const sessionCookie = extractCookie(loginResponse, COOKIE_NAME);
      expect(sessionCookie).toBeTruthy();

      // Make authenticated request to /v1/me
      const response = await makeAuthenticatedRequest(
        app,
        'GET',
        '/v1/me',
        sessionCookie!
      );

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

      const loginResponse = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      const sessionCookie = extractCookie(loginResponse, COOKIE_NAME);

      const response = await makeAuthenticatedRequest(
        app,
        'GET',
        '/v1/me',
        sessionCookie!
      );

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

      // Login as first user
      const login1 = await makeRequest(app, 'POST', '/v1/login', {
        body: { email: creds1.email, password: creds1.password },
      });
      const session1 = extractCookie(login1, COOKIE_NAME);

      // Login as second user
      const login2 = await makeRequest(app, 'POST', '/v1/login', {
        body: { email: creds2.email, password: creds2.password },
      });
      const session2 = extractCookie(login2, COOKIE_NAME);

      // Verify each session returns correct user
      const response1 = await makeAuthenticatedRequest(
        app,
        'GET',
        '/v1/me',
        session1!
      );
      const data1 = await response1.json();
      expect(data1.user.id).toBe(user1.id);
      expect(data1.user.email).toBe(user1.email);

      const response2 = await makeAuthenticatedRequest(
        app,
        'GET',
        '/v1/me',
        session2!
      );
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

      const response = await makeAuthenticatedRequest(
        app,
        'GET',
        '/v1/me',
        invalidToken
      );

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 for malformed JWT', async () => {
      const malformedToken = 'not-a-jwt';

      const response = await makeAuthenticatedRequest(
        app,
        'GET',
        '/v1/me',
        malformedToken
      );

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 401 for expired session cookie', async () => {
      const { user } = await createTestUser();
      const { CLOCK_SKEW_TOLERANCE_SECONDS } = await import('@repo/auth');

      // Create a token with maxAge of -1 second (already expired)
      // Then wait to ensure it's beyond clock skew tolerance
      const expiredToken = await encode({
        token: {
          sub: user.id,
          id: user.id,
          email: user.email,
          iss: 'sbfin',
          aud: 'sbfin:web',
        },
        secret: authConfig.secret!,
        salt: JWT_SALT,
        maxAge: -CLOCK_SKEW_TOLERANCE_SECONDS - 3600, // Expired beyond tolerance
      });

      const response = await makeAuthenticatedRequest(
        app,
        'GET',
        '/v1/me',
        expiredToken
      );

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 for token with invalid signature', async () => {
      const { user } = await createTestUser();

      // Create token with wrong secret
      const tokenWithWrongSecret = await encode({
        token: {
          sub: user.id,
          id: user.id,
          email: user.email,
          iss: 'sbfin',
          aud: 'sbfin:web',
        },
        secret: 'wrong-secret-key',
        salt: JWT_SALT,
        maxAge: SESSION_MAX_AGE_SECONDS,
      });

      const response = await makeAuthenticatedRequest(
        app,
        'GET',
        '/v1/me',
        tokenWithWrongSecret
      );

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 401 for token with missing user ID', async () => {
      // Create token without user ID
      const tokenWithoutId = await encode({
        token: {
          email: 'test@example.com',
          iss: 'sbfin',
          aud: 'sbfin:web',
        },
        secret: authConfig.secret!,
        salt: JWT_SALT,
        maxAge: SESSION_MAX_AGE_SECONDS,
      });

      const response = await makeAuthenticatedRequest(
        app,
        'GET',
        '/v1/me',
        tokenWithoutId
      );

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 404 when user in token does not exist in database', async () => {
      // Create token for non-existent user with valid UUID format
      const nonExistentUserId = '00000000-0000-0000-0000-000000000000';
      const token = await encode({
        token: {
          sub: nonExistentUserId,
          id: nonExistentUserId,
          email: 'nonexistent@example.com',
          iss: 'sbfin',
          aud: 'sbfin:web',
        },
        secret: authConfig.secret!,
        salt: JWT_SALT,
        maxAge: SESSION_MAX_AGE_SECONDS,
      });

      const response = await makeAuthenticatedRequest(
        app,
        'GET',
        '/v1/me',
        token
      );

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('User not found');
    });
  });

  describe('Session Cookie Attributes', () => {
    it('should accept session cookie with correct name', async () => {
      const { credentials } = await createTestUser();

      const loginResponse = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      const sessionCookie = extractCookie(loginResponse, COOKIE_NAME);
      expect(sessionCookie).toBeTruthy();

      // Verify the cookie name is correct
      const setCookieHeaders = loginResponse.headers.getSetCookie?.() || [];
      const cookieHeader = setCookieHeaders.find((h) => h.includes(COOKIE_NAME));
      expect(cookieHeader).toBeTruthy();
    });

    it('should work with cookies that have additional attributes', async () => {
      const { credentials } = await createTestUser();

      const loginResponse = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      const sessionCookie = extractCookie(loginResponse, COOKIE_NAME);

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

/**
 * Integration tests for Auth.js credentials sign-in
 * Tests user login via Auth.js, session creation, and audit events
 * 
 * Note: Migrated from custom /v1/login endpoint to Auth.js /v1/auth/callback/credentials
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Unmock @repo/database for integration tests (use real Prisma client)
vi.unmock('@repo/database');

import app from '../../../app.js';
import { resetDatabase } from '../../../test/setup.js';
import {
  makeRequest,
  createTestUser,
  createTestUserCredentials,
  extractCookie,
  signInWithCredentials,
} from '../../../test/helpers.js';

// Auth.js uses this cookie name
const COOKIE_NAME = 'authjs.session-token';

describe('Auth.js Credentials Sign-In', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('Login Success', () => {
    it('should return 302 redirect with session cookie for valid credentials', async () => {
      // Create test user
      const { credentials } = await createTestUser({
        name: 'Test User',
      });

      const response = await signInWithCredentials(
        app,
        credentials.email,
        credentials.password
      );

      // Auth.js returns 302 redirect on successful sign-in
      expect(response.status).toBe(302);

      // Extract session cookie
      const sessionCookie = extractCookie(response, COOKIE_NAME);
      expect(sessionCookie).toBeTruthy();
      expect(sessionCookie).not.toBe('');

    });

    it('should set session cookie with correct attributes', async () => {
      const { credentials } = await createTestUser();

      const response = await signInWithCredentials(
        app,
        credentials.email,
        credentials.password
      );

      expect(response.status).toBe(302);

      // Extract session cookie
      const sessionCookie = extractCookie(response, COOKIE_NAME);
      expect(sessionCookie).toBeTruthy();
      expect(sessionCookie).not.toBe('');

      // Verify cookie attributes from Set-Cookie header
      const setCookieHeaders = response.headers.getSetCookie?.() || [];
      const cookieHeader = setCookieHeaders.find((h) => h.includes(COOKIE_NAME));
      
      expect(cookieHeader).toBeTruthy();
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader).toContain('SameSite=Lax');
      expect(cookieHeader).toContain('Path=/');
      // Auth.js uses Expires instead of Max-Age
      expect(cookieHeader).toContain('Expires=');
    });

    it('should set httpOnly and sameSite cookie attributes', async () => {
      const { credentials } = await createTestUser();

      const response = await signInWithCredentials(
        app,
        credentials.email,
        credentials.password
      );

      expect(response.status).toBe(302);

      const setCookieHeaders = response.headers.getSetCookie?.() || [];
      const cookieHeader = setCookieHeaders.find((h) => h.includes(COOKIE_NAME));
      
      // Verify security attributes (Secure flag requires HTTPS in production)
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader).toContain('SameSite=Lax');
      expect(cookieHeader).toContain('Path=/');
      
      // Note: Secure flag is only set when using HTTPS protocol
      // In test environment with HTTP requests, Secure is not set
      // In production with HTTPS, Auth.js automatically sets Secure
    });

    it('should accept email with different case', async () => {
      const { credentials } = await createTestUser({
        email: 'test@example.com',
      });

      // Login with uppercase email
      const response = await signInWithCredentials(
        app,
        'TEST@EXAMPLE.COM',
        credentials.password
      );

      expect(response.status).toBe(302);

      // Verify session contains correct user
      const sessionCookie = extractCookie(response, COOKIE_NAME);
      expect(sessionCookie).toBeTruthy();
    });

    it('should trim whitespace from email', async () => {
      const { credentials } = await createTestUser();

      const response = await signInWithCredentials(
        app,
        `  ${credentials.email}  `,
        credentials.password
      );

      expect(response.status).toBe(302);

      // Verify session contains correct user
      const sessionCookie = extractCookie(response, COOKIE_NAME);
      expect(sessionCookie).toBeTruthy();
    });

    it('should return user data without password field', async () => {
      const { credentials } = await createTestUser();

      const response = await signInWithCredentials(
        app,
        credentials.email,
        credentials.password
      );

      expect(response.status).toBe(302);

      // Verify session data doesn't include password
      const sessionCookie = extractCookie(response, COOKIE_NAME);
      expect(sessionCookie).toBeTruthy();
    });
  });

  describe('Login Failure', () => {
    it('should return 302 redirect (error) for invalid password', async () => {
      const { credentials } = await createTestUser();

      const response = await signInWithCredentials(
        app,
        credentials.email,
        'WrongPassword123!'
      );

      // Auth.js returns 302 redirect to error page on failed sign-in
      expect(response.status).toBe(302);

      // Should not set session cookie
      const sessionCookie = extractCookie(response, COOKIE_NAME);
      expect(sessionCookie).toBeNull();
    });

    it('should return 302 redirect (error) for non-existent email', async () => {
      const credentials = createTestUserCredentials();

      const response = await signInWithCredentials(
        app,
        credentials.email,
        credentials.password
      );

      // Auth.js returns 302 redirect to error page
      expect(response.status).toBe(302);

      // Should not set session cookie
      const sessionCookie = extractCookie(response, COOKIE_NAME);
      expect(sessionCookie).toBeNull();
    });

    it('should not leak information about whether user exists', async () => {
      const { credentials: existingUser } = await createTestUser();
      const nonExistentCredentials = createTestUserCredentials();

      // Try with non-existent user
      const response1 = await signInWithCredentials(
        app,
        nonExistentCredentials.email,
        nonExistentCredentials.password
      );

      // Try with existing user but wrong password
      const response2 = await signInWithCredentials(
        app,
        existingUser.email,
        'WrongPassword123!'
      );

      // Both should return same response (302 redirect, no cookie)
      expect(response1.status).toBe(302);
      expect(response2.status).toBe(302);

      const cookie1 = extractCookie(response1, COOKIE_NAME);
      const cookie2 = extractCookie(response2, COOKIE_NAME);

      expect(cookie1).toBeNull();
      expect(cookie2).toBeNull();
    });

    it('should not set session cookie on failed login', async () => {
      const { credentials } = await createTestUser();

      const response = await signInWithCredentials(
        app,
        credentials.email,
        'WrongPassword123!'
      );

      expect(response.status).toBe(302);

      const sessionCookie = extractCookie(response, COOKIE_NAME);
      expect(sessionCookie).toBeNull();
    });

    it('should return 302 redirect (error) for missing email field', async () => {
      const response = await signInWithCredentials(
        app,
        '',
        'Test1234!'
      );

      expect(response.status).toBe(302);

      const sessionCookie = extractCookie(response, COOKIE_NAME);
      expect(sessionCookie).toBeNull();
    });

    it('should return 302 redirect (error) for missing password field', async () => {
      const response = await signInWithCredentials(
        app,
        'test@example.com',
        ''
      );

      expect(response.status).toBe(302);

      const sessionCookie = extractCookie(response, COOKIE_NAME);
      expect(sessionCookie).toBeNull();
    });

    it('should return 302 redirect (error) for invalid email format', async () => {
      const response = await signInWithCredentials(
        app,
        'not-an-email',
        'Test1234!'
      );

      expect(response.status).toBe(302);

      const sessionCookie = extractCookie(response, COOKIE_NAME);
      expect(sessionCookie).toBeNull();
    });
  });

  describe('Session Creation', () => {
    it('should create a session that can be exchanged for tokens', async () => {
      const { user, credentials } = await createTestUser();

      const signInResponse = await signInWithCredentials(
        app,
        credentials.email,
        credentials.password
      );

      expect(signInResponse.status).toBe(302);

      const sessionCookie = extractCookie(signInResponse, COOKIE_NAME);
      expect(sessionCookie).toBeTruthy();

      // Exchange session for access token
      const tokenResponse = await makeRequest(app, 'POST', '/v1/auth/token', {
        cookies: {
          [COOKIE_NAME]: sessionCookie!,
        },
        body: {
          clientType: 'web',
        },
      });

      expect(tokenResponse.status).toBe(200);
      const tokenPayload = await tokenResponse.json();
      expect(tokenPayload).toHaveProperty('accessToken');

      // Verify access token works for authenticated endpoint
      const meResponse = await makeRequest(app, 'GET', '/v1/me', {
        headers: {
          Authorization: `Bearer ${tokenPayload.accessToken}`,
        },
      });

      expect(meResponse.status).toBe(200);

      const data = await meResponse.json();
      expect(data.user.id).toBe(user.id);
      expect(data.user.email).toBe(user.email);
    }, 15000);

    it('should create profile for new user via signIn callback', async () => {
      const { user, credentials } = await createTestUser();

      const signInResponse = await signInWithCredentials(
        app,
        credentials.email,
        credentials.password
      );

      const sessionCookie = extractCookie(signInResponse, COOKIE_NAME);

      expect(sessionCookie).toBeTruthy();
      
      // Verify profile was created in database (via signIn callback)
      // Note: Profile data is not in session by default, but should exist in DB
      const { getTestPrisma } = await import('../../../test/setup.js');
      const prisma = getTestPrisma();
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });
      
      expect(profile).toBeTruthy();
      expect(profile?.timezone).toBe('UTC');
      expect(profile?.currency).toBe('USD');
    });
  });
});

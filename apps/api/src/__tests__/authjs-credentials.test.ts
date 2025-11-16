/**
 * Integration tests for Auth.js Credentials Provider
 * Tests Auth.js handler with credentials sign-in, session management, and sign-out
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Unmock @repo/database for integration tests (use real Prisma client)
vi.unmock('@repo/database');

import app from '../app.js';
import { resetDatabase } from '../test/setup.js';
import {
  makeRequest,
  createTestUser,
  extractCookie,
  signInWithCredentials,
} from '../test/helpers.js';

describe('Auth.js Credentials Provider', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('POST /v1/auth/callback/credentials - Sign In', () => {
    it('should return 302 redirect with session cookie for valid credentials', async () => {
      // Create test user
      const { credentials } = await createTestUser({
        name: 'Test User',
      });

      // Sign in with credentials (handles CSRF automatically)
      const response = await signInWithCredentials(
        app,
        credentials.email,
        credentials.password
      );

      // Auth.js returns 302 redirect on successful sign-in
      expect(response.status).toBe(302);

      // Extract session cookie
      const sessionCookie = extractCookie(response, 'authjs.session-token');
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

      // Verify cookie attributes from Set-Cookie header
      const setCookieHeaders = response.headers.getSetCookie?.() || [];
      const cookieHeader = setCookieHeaders.find((h) => h.includes('authjs.session-token'));
      
      expect(cookieHeader).toBeTruthy();
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader).toContain('SameSite=Lax');
      expect(cookieHeader).toContain('Path=/');
      // Auth.js uses Expires instead of Max-Age
      expect(cookieHeader).toContain('Expires=');
    });

    it('should accept email with different case', async () => {
      await createTestUser({
        email: 'test@example.com',
        password: 'Test1234!',
      });

      // Login with uppercase email
      const response = await signInWithCredentials(
        app,
        'TEST@EXAMPLE.COM',
        'Test1234!'
      );

      expect(response.status).toBe(302);

      const sessionCookie = extractCookie(response, 'authjs.session-token');
      expect(sessionCookie).toBeTruthy();
    });

    it('should return error for invalid password', async () => {
      const { credentials } = await createTestUser();

      const response = await signInWithCredentials(
        app,
        credentials.email,
        'WrongPassword123!'
      );

      // Auth.js returns 302 redirect to error page on failed sign-in
      expect(response.status).toBe(302);

      // Should not set session cookie
      const sessionCookie = extractCookie(response, 'authjs.session-token');
      expect(sessionCookie).toBeNull();
    });

    it('should return error for non-existent email', async () => {
      const response = await signInWithCredentials(
        app,
        'nonexistent@example.com',
        'Test1234!'
      );

      expect(response.status).toBe(302);

      const sessionCookie = extractCookie(response, 'authjs.session-token');
      expect(sessionCookie).toBeNull();
    });

    it('should return error for missing email field', async () => {
      const response = await signInWithCredentials(
        app,
        '',
        'Test1234!'
      );

      expect(response.status).toBe(302);

      const sessionCookie = extractCookie(response, 'authjs.session-token');
      expect(sessionCookie).toBeNull();
    });

    it('should return error for missing password field', async () => {
      const response = await signInWithCredentials(
        app,
        'test@example.com',
        ''
      );

      expect(response.status).toBe(302);

      const sessionCookie = extractCookie(response, 'authjs.session-token');
      expect(sessionCookie).toBeNull();
    });
  });

  describe('POST /v1/auth/signout - Sign Out', () => {
    it('should clear session cookie on sign out', async () => {
      // Create test user and sign in
      const { credentials } = await createTestUser();

      const signInResponse = await signInWithCredentials(
        app,
        credentials.email,
        credentials.password
      );

      const sessionCookie = extractCookie(signInResponse, 'authjs.session-token');
      expect(sessionCookie).toBeTruthy();

      // Sign out
      const signOutResponse = await makeRequest(app, 'POST', '/v1/auth/signout', {
        cookies: {
          'authjs.session-token': sessionCookie!,
        },
      });

      // Auth.js returns 302 redirect on sign out
      expect(signOutResponse.status).toBe(302);

      // Verify cookie is cleared (Max-Age=0 or expires in past)
      const setCookieHeaders = signOutResponse.headers.getSetCookie?.() || [];
      const cookieHeader = setCookieHeaders.find((h) => h.includes('authjs.session-token'));
      
      // Auth.js MUST set a cookie to clear the session - fail if missing
      expect(cookieHeader).toBeTruthy();
      if (!cookieHeader) {
        throw new Error('Sign-out response missing Set-Cookie header for authjs.session-token');
      }
      
      // Verify the cookie is actually cleared (not just present)
      const isCleared = 
        cookieHeader.includes('Max-Age=0') || 
        cookieHeader.includes('expires=Thu, 01 Jan 1970') ||
        cookieHeader.includes('authjs.session-token=;') ||
        cookieHeader.includes('authjs.session-token=deleted');
      
      if (!isCleared) {
        throw new Error(`Sign-out Set-Cookie header does not clear the cookie: ${cookieHeader}`);
      }
      expect(isCleared).toBe(true);
    });

    it('should invalidate session after sign out (cookie cleared)', async () => {
      // Create test user and sign in
      const { credentials } = await createTestUser();

      const signInResponse = await signInWithCredentials(
        app,
        credentials.email,
        credentials.password
      );

      const sessionCookie = extractCookie(signInResponse, 'authjs.session-token');

      // Sign out
      const signOutResponse = await makeRequest(app, 'POST', '/v1/auth/signout', {
        cookies: {
          'authjs.session-token': sessionCookie!,
        },
      });

      expect(signOutResponse.status).toBe(302);

      // Verify cookie is cleared in the sign-out response
      const setCookieHeaders = signOutResponse.headers.getSetCookie?.() || [];
      const cookieHeader = setCookieHeaders.find((h) => h.includes('authjs.session-token'));
      
      // Auth.js MUST set a cookie to clear the session - fail if missing
      expect(cookieHeader).toBeTruthy();
      if (!cookieHeader) {
        throw new Error('Sign-out response missing Set-Cookie header for authjs.session-token');
      }
      
      // Verify the cookie is actually cleared (not just present)
      const isCleared = 
        cookieHeader.includes('Max-Age=0') || 
        cookieHeader.includes('expires=Thu, 01 Jan 1970') ||
        cookieHeader.includes('authjs.session-token=;') ||
        cookieHeader.includes('authjs.session-token=deleted');
      
      if (!isCleared) {
        throw new Error(`Sign-out Set-Cookie header does not clear the cookie: ${cookieHeader}`);
      }
      expect(isCleared).toBe(true);

    });

    it('should handle sign out without session cookie', async () => {
      const response = await makeRequest(app, 'POST', '/v1/auth/signout');

      // Should still return 302 redirect even without cookie
      expect(response.status).toBe(302);
    });
  });

  describe('GET /v1/auth/providers - List Providers', () => {
    it('should return list of available providers', async () => {
      const response = await makeRequest(app, 'GET', '/v1/auth/providers');

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('credentials');
      expect(data.credentials).toMatchObject({
        id: 'credentials',
        name: 'Credentials',
        type: 'credentials',
      });
    });
  });

});

/**
 * Integration tests for POST /v1/logout endpoint
 * Tests user logout, cookie deletion, and session invalidation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../../app.js';
import { resetDatabase } from '../../../test/setup.js';
import {
  makeRequest,
  makeAuthenticatedRequest,
  createTestUser,
  extractCookie,
} from '../../../test/helpers.js';
import { COOKIE_NAME, authEvents } from '@repo/auth';

describe('POST /v1/logout', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('Logout Success', () => {
    it('should return 204 No Content', async () => {
      // Create test user and login
      const { credentials } = await createTestUser();

      const loginResponse = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      expect(loginResponse.status).toBe(200);

      const sessionCookie = extractCookie(loginResponse, COOKIE_NAME);
      expect(sessionCookie).toBeTruthy();

      // Logout
      const logoutResponse = await makeAuthenticatedRequest(
        app,
        'POST',
        '/v1/logout',
        sessionCookie!
      );

      expect(logoutResponse.status).toBe(204);
      expect(await logoutResponse.text()).toBe('');
    });

    it('should delete session cookie', async () => {
      // Create test user and login
      const { credentials } = await createTestUser();

      const loginResponse = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      const sessionCookie = extractCookie(loginResponse, COOKIE_NAME);
      expect(sessionCookie).toBeTruthy();

      // Logout
      const logoutResponse = await makeAuthenticatedRequest(
        app,
        'POST',
        '/v1/logout',
        sessionCookie!
      );

      expect(logoutResponse.status).toBe(204);

      // Verify cookie deletion by checking Set-Cookie header
      const setCookieHeaders = logoutResponse.headers.getSetCookie?.() || [];
      const deleteCookieHeader = setCookieHeaders.find((h) =>
        h.includes(COOKIE_NAME)
      );

      expect(deleteCookieHeader).toBeTruthy();
      // Cookie should be deleted (Max-Age=0 or expires in the past)
      expect(
        deleteCookieHeader?.includes('Max-Age=0') ||
          deleteCookieHeader?.includes('expires=Thu, 01 Jan 1970')
      ).toBe(true);
    });

    it('should work without authentication (no session cookie required)', async () => {
      // Logout without being logged in should still work
      const logoutResponse = await makeRequest(app, 'POST', '/v1/logout');

      expect(logoutResponse.status).toBe(204);
    });

    it('should work with invalid session cookie', async () => {
      // Logout with invalid cookie should still work
      const logoutResponse = await makeAuthenticatedRequest(
        app,
        'POST',
        '/v1/logout',
        'invalid-session-token'
      );

      expect(logoutResponse.status).toBe(204);
    });
  });

  describe('Session Invalidation', () => {
    it('should instruct client to delete session cookie', async () => {
      // Create test user and login
      const { credentials } = await createTestUser();

      const loginResponse = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      const sessionCookie = extractCookie(loginResponse, COOKIE_NAME);
      expect(sessionCookie).toBeTruthy();

      // Verify session works before logout
      const meResponseBefore = await makeAuthenticatedRequest(
        app,
        'GET',
        '/v1/me',
        sessionCookie!
      );

      expect(meResponseBefore.status).toBe(200);

      // Logout
      const logoutResponse = await makeAuthenticatedRequest(
        app,
        'POST',
        '/v1/logout',
        sessionCookie!
      );

      expect(logoutResponse.status).toBe(204);

      // Verify cookie deletion header was sent
      const setCookieHeaders = logoutResponse.headers.getSetCookie?.() || [];
      const deleteCookieHeader = setCookieHeaders.find((h) =>
        h.includes(COOKIE_NAME)
      );

      expect(deleteCookieHeader).toBeTruthy();
      // Cookie should be deleted (Max-Age=0 or expires in the past)
      expect(
        deleteCookieHeader?.includes('Max-Age=0') ||
          deleteCookieHeader?.includes('expires=Thu, 01 Jan 1970')
      ).toBe(true);

      // Note: With stateless JWT authentication, the token itself remains valid
      // until expiration. The logout only instructs the client to delete the cookie.
      // In a production app, the client would honor this and not send the cookie again.
    });

    it('should allow new login after logout', async () => {
      // Create test user and login
      const { credentials } = await createTestUser();

      const loginResponse1 = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      const sessionCookie1 = extractCookie(loginResponse1, COOKIE_NAME);
      expect(sessionCookie1).toBeTruthy();

      // Logout
      const logoutResponse = await makeAuthenticatedRequest(
        app,
        'POST',
        '/v1/logout',
        sessionCookie1!
      );

      expect(logoutResponse.status).toBe(204);

      // Login again
      const loginResponse2 = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      expect(loginResponse2.status).toBe(200);

      const sessionCookie2 = extractCookie(loginResponse2, COOKIE_NAME);
      expect(sessionCookie2).toBeTruthy();

      // New session should work
      const meResponse = await makeAuthenticatedRequest(
        app,
        'GET',
        '/v1/me',
        sessionCookie2!
      );

      expect(meResponse.status).toBe(200);
    });

    it('should handle multiple logout calls gracefully', async () => {
      // Create test user and login
      const { credentials } = await createTestUser();

      const loginResponse = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      const sessionCookie = extractCookie(loginResponse, COOKIE_NAME);
      expect(sessionCookie).toBeTruthy();

      // First logout
      const logoutResponse1 = await makeAuthenticatedRequest(
        app,
        'POST',
        '/v1/logout',
        sessionCookie!
      );

      expect(logoutResponse1.status).toBe(204);

      // Second logout (should still work)
      const logoutResponse2 = await makeAuthenticatedRequest(
        app,
        'POST',
        '/v1/logout',
        sessionCookie!
      );

      expect(logoutResponse2.status).toBe(204);
    });
  });

  describe('Cookie Attributes', () => {
    it('should delete cookie with correct path', async () => {
      // Create test user and login
      const { credentials } = await createTestUser();

      const loginResponse = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      const sessionCookie = extractCookie(loginResponse, COOKIE_NAME);
      expect(sessionCookie).toBeTruthy();

      // Logout
      const logoutResponse = await makeAuthenticatedRequest(
        app,
        'POST',
        '/v1/logout',
        sessionCookie!
      );

      expect(logoutResponse.status).toBe(204);

      // Verify cookie deletion includes Path=/
      const setCookieHeaders = logoutResponse.headers.getSetCookie?.() || [];
      const deleteCookieHeader = setCookieHeaders.find((h) =>
        h.includes(COOKIE_NAME)
      );

      expect(deleteCookieHeader).toContain('Path=/');
    });
  });

  describe('Logout Audit Events', () => {
    it('should emit user.logout event on logout', async () => {
      // Create test user and login
      const { credentials } = await createTestUser();

      const loginResponse = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      const sessionCookie = extractCookie(loginResponse, COOKIE_NAME);
      expect(sessionCookie).toBeTruthy();

      // Set up event listener
      const eventPromise = new Promise<any>((resolve) => {
        authEvents.on((event) => {
          if (event.type === 'user.logout') {
            resolve(event);
          }
        });
      });

      // Logout
      const logoutResponse = await makeAuthenticatedRequest(
        app,
        'POST',
        '/v1/logout',
        sessionCookie!
      );

      expect(logoutResponse.status).toBe(204);

      // Wait for event to be emitted
      const event = await eventPromise;

      expect(event.type).toBe('user.logout');
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should include IP address in event when x-forwarded-for header is present', async () => {
      // Create test user and login
      const { credentials } = await createTestUser();
      const testIp = '192.168.1.100';

      const loginResponse = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      const sessionCookie = extractCookie(loginResponse, COOKIE_NAME);
      expect(sessionCookie).toBeTruthy();

      // Set up event listener
      const eventPromise = new Promise<any>((resolve) => {
        authEvents.on((event) => {
          if (event.type === 'user.logout') {
            resolve(event);
          }
        });
      });

      // Logout with IP header
      const logoutResponse = await makeAuthenticatedRequest(
        app,
        'POST',
        '/v1/logout',
        sessionCookie!,
        {
          headers: {
            'x-forwarded-for': testIp,
          },
        }
      );

      expect(logoutResponse.status).toBe(204);

      // Wait for event to be emitted
      const event = await eventPromise;

      expect(event.type).toBe('user.logout');
      expect(event.ip).toBe(testIp);
    });

    it('should include IP address in event when x-real-ip header is present', async () => {
      // Create test user and login
      const { credentials } = await createTestUser();
      const testIp = '10.0.0.50';

      const loginResponse = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      const sessionCookie = extractCookie(loginResponse, COOKIE_NAME);
      expect(sessionCookie).toBeTruthy();

      // Set up event listener
      const eventPromise = new Promise<any>((resolve) => {
        authEvents.on((event) => {
          if (event.type === 'user.logout') {
            resolve(event);
          }
        });
      });

      // Logout with IP header
      const logoutResponse = await makeAuthenticatedRequest(
        app,
        'POST',
        '/v1/logout',
        sessionCookie!,
        {
          headers: {
            'x-real-ip': testIp,
          },
        }
      );

      expect(logoutResponse.status).toBe(204);

      // Wait for event to be emitted
      const event = await eventPromise;

      expect(event.type).toBe('user.logout');
      expect(event.ip).toBe(testIp);
    });

    it('should emit event even without session cookie', async () => {
      // Set up event listener
      const eventPromise = new Promise<any>((resolve) => {
        authEvents.on((event) => {
          if (event.type === 'user.logout') {
            resolve(event);
          }
        });
      });

      // Logout without being logged in
      const logoutResponse = await makeRequest(app, 'POST', '/v1/logout');

      expect(logoutResponse.status).toBe(204);

      // Wait for event to be emitted
      const event = await eventPromise;

      expect(event.type).toBe('user.logout');
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should prefer x-forwarded-for over x-real-ip when both are present', async () => {
      // Create test user and login
      const { credentials } = await createTestUser();
      const forwardedIp = '192.168.1.100';
      const realIp = '10.0.0.50';

      const loginResponse = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      const sessionCookie = extractCookie(loginResponse, COOKIE_NAME);
      expect(sessionCookie).toBeTruthy();

      // Set up event listener
      const eventPromise = new Promise<any>((resolve) => {
        authEvents.on((event) => {
          if (event.type === 'user.logout') {
            resolve(event);
          }
        });
      });

      // Logout with both IP headers
      const logoutResponse = await makeAuthenticatedRequest(
        app,
        'POST',
        '/v1/logout',
        sessionCookie!,
        {
          headers: {
            'x-forwarded-for': forwardedIp,
            'x-real-ip': realIp,
          },
        }
      );

      expect(logoutResponse.status).toBe(204);

      // Wait for event to be emitted
      const event = await eventPromise;

      expect(event.type).toBe('user.logout');
      expect(event.ip).toBe(forwardedIp);
    });
  });
});

/**
 * Integration tests for POST /v1/login endpoint
 * Tests user login, session creation, and audit events
 */

import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../../app.js';
import { resetDatabase } from '../../../test/setup.js';
import {
  makeRequest,
  createTestUser,
  createTestUserCredentials,
  extractCookie,
} from '../../../test/helpers.js';
import { authEvents, COOKIE_NAME } from '@repo/auth';

describe('POST /v1/login', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('Login Success', () => {
    it('should return 200 with user data for valid credentials', async () => {
      // Create test user
      const { user, credentials } = await createTestUser({
        name: 'Test User',
      });

      const response = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
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

    it('should set session cookie with correct attributes', async () => {
      const { credentials } = await createTestUser();

      const response = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      expect(response.status).toBe(200);

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
      expect(cookieHeader).toContain('Max-Age=');
    });

    it('should set secure cookie in production environment', async () => {
      const { credentials } = await createTestUser();
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      expect(response.status).toBe(200);

      const setCookieHeaders = response.headers.getSetCookie?.() || [];
      const cookieHeader = setCookieHeaders.find((h) => h.includes(COOKIE_NAME));
      
      expect(cookieHeader).toContain('Secure');

      // Restore environment
      process.env.NODE_ENV = originalEnv;
    });

    it('should accept email with different case', async () => {
      const { user, credentials } = await createTestUser({
        email: 'test@example.com',
      });

      // Login with uppercase email
      const response = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: 'TEST@EXAMPLE.COM',
          password: credentials.password,
        },
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.user.id).toBe(user.id);
      expect(data.user.email).toBe('test@example.com');
    });

    it('should trim whitespace from email', async () => {
      const { user, credentials } = await createTestUser();

      const response = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: `  ${credentials.email}  `,
          password: credentials.password,
        },
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.user.id).toBe(user.id);
    });

    it('should return user data without password field', async () => {
      const { credentials } = await createTestUser();

      const response = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.user).not.toHaveProperty('password');
      expect(Object.keys(data.user)).toEqual(['id', 'email', 'name', 'createdAt']);
    });
  });

  describe('Login Failure', () => {
    it('should return 401 for invalid password', async () => {
      const { credentials } = await createTestUser();

      const response = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: 'WrongPassword123!',
        },
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Invalid credentials');
    });

    it('should return 401 for non-existent email', async () => {
      const credentials = createTestUserCredentials();

      const response = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Invalid credentials');
    });

    it('should not leak information about whether user exists', async () => {
      const { credentials: existingUser } = await createTestUser();
      const nonExistentCredentials = createTestUserCredentials();

      // Try with non-existent user
      const response1 = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: nonExistentCredentials.email,
          password: nonExistentCredentials.password,
        },
      });

      // Try with existing user but wrong password
      const response2 = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: existingUser.email,
          password: 'WrongPassword123!',
        },
      });

      // Both should return same error message
      expect(response1.status).toBe(401);
      expect(response2.status).toBe(401);

      const data1 = await response1.json();
      const data2 = await response2.json();

      expect(data1.error).toBe(data2.error);
      expect(data1.error).toBe('Invalid credentials');
    });

    it('should not set session cookie on failed login', async () => {
      const { credentials } = await createTestUser();

      const response = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: 'WrongPassword123!',
        },
      });

      expect(response.status).toBe(401);

      const sessionCookie = extractCookie(response, COOKIE_NAME);
      expect(sessionCookie).toBeNull();
    });

    it('should return 400 for missing email field', async () => {
      const response = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          password: 'Test1234!',
        },
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 400 for missing password field', async () => {
      const response = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: 'test@example.com',
        },
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 400 for invalid email format', async () => {
      const response = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: 'not-an-email',
          password: 'Test1234!',
        },
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('Login Audit Events', () => {
    it('should emit user.login.success event on successful login', async () => {
      const { user, credentials } = await createTestUser();

      // Set up event listener
      const eventPromise = new Promise<any>((resolve) => {
        authEvents.on((event) => {
          if (event.type === 'user.login.success') {
            resolve(event);
          }
        });
      });

      const response = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      expect(response.status).toBe(200);

      // Wait for event to be emitted
      const event = await eventPromise;

      expect(event.type).toBe('user.login.success');
      expect(event.userId).toBe(user.id);
      expect(event.email).toBe(user.email);
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should emit user.login.failed event on invalid password', async () => {
      const { user, credentials } = await createTestUser();

      // Set up event listener
      const eventPromise = new Promise<any>((resolve) => {
        authEvents.on((event) => {
          if (event.type === 'user.login.failed') {
            resolve(event);
          }
        });
      });

      const response = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: 'WrongPassword123!',
        },
      });

      expect(response.status).toBe(401);

      // Wait for event to be emitted
      const event = await eventPromise;

      expect(event.type).toBe('user.login.failed');
      expect(event.userId).toBe(user.id);
      expect(event.email).toBe(user.email);
      expect(event.metadata).toHaveProperty('reason');
      expect(event.metadata.reason).toBe('invalid_password');
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should emit user.login.failed event on non-existent user', async () => {
      const credentials = createTestUserCredentials();

      // Set up event listener
      const eventPromise = new Promise<any>((resolve) => {
        authEvents.on((event) => {
          if (event.type === 'user.login.failed') {
            resolve(event);
          }
        });
      });

      const response = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });

      expect(response.status).toBe(401);

      // Wait for event to be emitted
      const event = await eventPromise;

      expect(event.type).toBe('user.login.failed');
      expect(event.email).toBe(credentials.email);
      expect(event.metadata).toHaveProperty('reason');
      expect(event.metadata.reason).toBe('user_not_found');
      expect(event.timestamp).toBeInstanceOf(Date);
      // userId should not be present for non-existent users
      expect(event.userId).toBeUndefined();
    });

    it('should include IP address in success event when x-forwarded-for header is present', async () => {
      const { credentials } = await createTestUser();
      const testIp = '192.168.1.100';

      // Set up event listener
      const eventPromise = new Promise<any>((resolve) => {
        authEvents.on((event) => {
          if (event.type === 'user.login.success') {
            resolve(event);
          }
        });
      });

      const response = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: credentials.password,
        },
        headers: {
          'x-forwarded-for': testIp,
        },
      });

      expect(response.status).toBe(200);

      // Wait for event to be emitted
      const event = await eventPromise;

      expect(event.ip).toBe(testIp);
    });

    it('should include IP address in failed event when x-real-ip header is present', async () => {
      const { credentials } = await createTestUser();
      const testIp = '10.0.0.50';

      // Set up event listener
      const eventPromise = new Promise<any>((resolve) => {
        authEvents.on((event) => {
          if (event.type === 'user.login.failed') {
            resolve(event);
          }
        });
      });

      const response = await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: credentials.email,
          password: 'WrongPassword123!',
        },
        headers: {
          'x-real-ip': testIp,
        },
      });

      expect(response.status).toBe(401);

      // Wait for event to be emitted
      const event = await eventPromise;

      expect(event.ip).toBe(testIp);
    });

    it('should include failure reason metadata in failed login events', async () => {
      const { credentials: existingUser } = await createTestUser();
      const nonExistentCredentials = createTestUserCredentials();

      // Test invalid password reason
      const eventPromise1 = new Promise<any>((resolve) => {
        authEvents.on((event) => {
          if (event.type === 'user.login.failed' && event.metadata?.reason === 'invalid_password') {
            resolve(event);
          }
        });
      });

      await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: existingUser.email,
          password: 'WrongPassword123!',
        },
      });

      const event1 = await eventPromise1;
      expect(event1.metadata.reason).toBe('invalid_password');

      // Test user not found reason
      const eventPromise2 = new Promise<any>((resolve) => {
        authEvents.on((event) => {
          if (event.type === 'user.login.failed' && event.metadata?.reason === 'user_not_found') {
            resolve(event);
          }
        });
      });

      await makeRequest(app, 'POST', '/v1/login', {
        body: {
          email: nonExistentCredentials.email,
          password: nonExistentCredentials.password,
        },
      });

      const event2 = await eventPromise2;
      expect(event2.metadata.reason).toBe('user_not_found');
    });
  });
});

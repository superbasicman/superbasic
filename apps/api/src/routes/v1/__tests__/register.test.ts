/**
 * Integration tests for POST /v1/register endpoint
 * Tests user registration, validation, and audit events
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Unmock @repo/database for integration tests (use real Prisma client)
vi.unmock('@repo/database');

// Mock rate limit to be permissive for registration tests
vi.mock('@repo/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/rate-limit')>();
  return {
    ...actual,
    createRateLimiter: () => ({
      checkLimit: async () => ({ allowed: true, remaining: 999, reset: 0 }),
      getUsage: async () => 0,
      resetLimit: async () => {},
    }),
    createMockRedis: () => ({}),
  };
});

import app from '../../../app.js';
import { resetDatabase, getTestPrisma } from '../../../test/setup.js';
import { makeRequest, createTestUserCredentials } from '../../../test/helpers.js';
import { authEvents } from '@repo/auth';
import { verifyPassword } from '@repo/auth';

describe('POST /v1/register', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('Registration Success', () => {
    it('should return 201 with user data for valid registration', async () => {
      const credentials = createTestUserCredentials({
        name: 'Test User',
      });

      const response = await makeRequest(app, 'POST', '/v1/register', {
        body: credentials,
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data).toHaveProperty('user');
      expect(data.user).toMatchObject({
        email: credentials.email,
        name: credentials.name,
      });
      expect(data.user).toHaveProperty('id');
      expect(data.user).toHaveProperty('createdAt');
      expect(data.user).not.toHaveProperty('password');
    });

    it('should create user in database with hashed password', async () => {
      const credentials = createTestUserCredentials();
      const prisma = getTestPrisma();

      const response = await makeRequest(app, 'POST', '/v1/register', {
        body: credentials,
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      const userId = data.user.id;

      // Verify user exists in database
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      expect(user).toBeTruthy();
      expect(user?.primaryEmail).toBe(credentials.email.toLowerCase());

      const passwordRecord = await prisma.userPassword.findUnique({ where: { userId } });
      expect(passwordRecord?.passwordHash).toBeTruthy();
      expect(passwordRecord?.passwordHash).not.toBe(credentials.password);
      expect(passwordRecord?.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt hash format

      const isValid = await verifyPassword(credentials.password, passwordRecord!.passwordHash);
      expect(isValid).toBe(true);
    });

    it('should normalize email to lowercase', async () => {
      const credentials = createTestUserCredentials({
        email: 'Test.User@EXAMPLE.COM',
      });

      const response = await makeRequest(app, 'POST', '/v1/register', {
        body: credentials,
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.user.email).toBe('test.user@example.com');
    });

    it('should handle registration without optional name field', async () => {
      const credentials = createTestUserCredentials();
      delete credentials.name;

      const response = await makeRequest(app, 'POST', '/v1/register', {
        body: credentials,
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.user.name).toBeNull();
    });
  });

  describe('Registration Validation', () => {
    it('should return 409 Conflict for duplicate email', async () => {
      const credentials = createTestUserCredentials();

      // Register first user
      const firstResponse = await makeRequest(app, 'POST', '/v1/register', {
        body: credentials,
      });
      expect(firstResponse.status).toBe(201);

      // Try to register with same email
      const secondResponse = await makeRequest(app, 'POST', '/v1/register', {
        body: credentials,
      });

      expect(secondResponse.status).toBe(409);
      const data = await secondResponse.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('Email already in use');
    });

    it('should return 409 for duplicate email regardless of case', async () => {
      const credentials = createTestUserCredentials({
        email: 'test@example.com',
      });

      // Register with lowercase
      const firstResponse = await makeRequest(app, 'POST', '/v1/register', {
        body: credentials,
      });
      expect(firstResponse.status).toBe(201);

      // Try to register with uppercase
      const secondResponse = await makeRequest(app, 'POST', '/v1/register', {
        body: {
          ...credentials,
          email: 'TEST@EXAMPLE.COM',
        },
      });

      expect(secondResponse.status).toBe(409);
    });

    it('should return 400 for invalid email format', async () => {
      const credentials = createTestUserCredentials({
        email: 'not-an-email',
      });

      const response = await makeRequest(app, 'POST', '/v1/register', {
        body: credentials,
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 400 for missing email field', async () => {
      const credentials = createTestUserCredentials();
      const { email, ...bodyWithoutEmail } = credentials;

      const response = await makeRequest(app, 'POST', '/v1/register', {
        body: bodyWithoutEmail,
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 400 for missing password field', async () => {
      const credentials = createTestUserCredentials();
      const { password, ...bodyWithoutPassword } = credentials;

      const response = await makeRequest(app, 'POST', '/v1/register', {
        body: bodyWithoutPassword,
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 400 for weak password (less than 8 characters)', async () => {
      const credentials = createTestUserCredentials({
        password: 'Short1!',
      });

      const response = await makeRequest(app, 'POST', '/v1/register', {
        body: credentials,
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('Registration Audit Events', () => {
    it('should emit user.registered event on successful registration', async () => {
      const credentials = createTestUserCredentials();
      let capturedEvent: any = null;

      // Set up event listener before making request
      const handler = (event: any) => {
        if (event.type === 'user.registered' && event.email === credentials.email) {
          capturedEvent = event;
        }
      };
      authEvents.on(handler);

      const response = await makeRequest(app, 'POST', '/v1/register', {
        body: credentials,
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      // Wait a bit for event to be emitted (fire-and-forget)
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(capturedEvent).toBeTruthy();
      expect(capturedEvent.type).toBe('user.registered');
      expect(capturedEvent.userId).toBe(data.user.id);
      expect(capturedEvent.email).toBe(credentials.email);
      expect(capturedEvent.timestamp).toBeInstanceOf(Date);
    });

    it('should include IP address in event when x-forwarded-for header is present', async () => {
      const credentials = createTestUserCredentials();
      const testIp = '192.168.1.100';
      let capturedEvent: any = null;

      // Set up event listener before making request
      const handler = (event: any) => {
        if (event.type === 'user.registered' && event.email === credentials.email) {
          capturedEvent = event;
        }
      };
      authEvents.on(handler);

      const response = await makeRequest(app, 'POST', '/v1/register', {
        body: credentials,
        headers: {
          'x-forwarded-for': testIp,
        },
      });

      expect(response.status).toBe(201);

      // Wait a bit for event to be emitted (fire-and-forget)
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(capturedEvent).toBeTruthy();
      expect(capturedEvent.ip).toBe(testIp);
    });

    it('should include IP address in event when x-real-ip header is present', async () => {
      const credentials = createTestUserCredentials();
      const testIp = '10.0.0.50';
      let capturedEvent: any = null;

      // Set up event listener before making request
      const handler = (event: any) => {
        if (event.type === 'user.registered' && event.email === credentials.email) {
          capturedEvent = event;
        }
      };
      authEvents.on(handler);

      const response = await makeRequest(app, 'POST', '/v1/register', {
        body: credentials,
        headers: {
          'x-real-ip': testIp,
        },
      });

      expect(response.status).toBe(201);

      // Wait a bit for event to be emitted (fire-and-forget)
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(capturedEvent).toBeTruthy();
      expect(capturedEvent.ip).toBe(testIp);
    });

    it('should not emit event on failed registration (duplicate email)', async () => {
      const credentials = createTestUserCredentials();

      // Register first user
      await makeRequest(app, 'POST', '/v1/register', {
        body: credentials,
      });

      // Set up event listener for second attempt
      let eventEmitted = false;
      authEvents.on((event) => {
        if (event.type === 'user.registered') {
          eventEmitted = true;
        }
      });

      // Try to register duplicate
      const response = await makeRequest(app, 'POST', '/v1/register', {
        body: credentials,
      });

      expect(response.status).toBe(409);

      // Wait a bit to ensure no event is emitted
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(eventEmitted).toBe(false);
    });
  });
});

/**
 * Infrastructure smoke tests
 * Verifies that test setup and helpers work correctly
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Unmock @repo/database for integration tests (use real Prisma client)
vi.unmock('@repo/database');

import { getTestPrisma, resetDatabase } from './setup.js';
import { createTestUser, createTestUserCredentials, makeRequest } from './helpers.js';
import app from '../app.js';

describe('Test Infrastructure', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('Database Setup', () => {
    it('should provide a working Prisma client', () => {
      const prisma = getTestPrisma();
      expect(prisma).toBeDefined();
    });

    it('should reset database between tests', async () => {
      const prisma = getTestPrisma();

      // Create a user
      await prisma.user.create({
        data: {
          primaryEmail: 'test@example.com',
          userState: 'active',
          password: {
            create: {
              passwordHash: 'hashed',
            },
          },
        },
      });

      // Verify user exists
      const usersBefore = await prisma.user.count();
      expect(usersBefore).toBe(1);

      // Reset database
      await resetDatabase();

      // Verify user is gone
      const usersAfter = await prisma.user.count();
      expect(usersAfter).toBe(0);
    });
  });

  describe('Test Helpers', () => {
    it('should create unique test user credentials', () => {
      const creds1 = createTestUserCredentials();
      const creds2 = createTestUserCredentials();

      expect(creds1.email).not.toBe(creds2.email);
      expect(creds1.password).toBe('Test1234!');
    });

    it('should create test user in database', async () => {
      const { user, credentials } = await createTestUser();

      expect(user.id).toBeDefined();
      expect(user.primaryEmail).toBe(credentials.email);
      expect(user.profile).toBeDefined();
    });

    it('should make HTTP requests to app', async () => {
      const response = await makeRequest(app, 'GET', '/health');

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('status', 'ok');
    });
  });
});

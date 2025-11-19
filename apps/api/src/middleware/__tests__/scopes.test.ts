/**
 * Integration tests for scope enforcement middleware
 * Tests that PAT tokens are properly restricted by scopes while session auth has full access
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Unmock @repo/database for integration tests (use real Prisma client)
vi.unmock('@repo/database');

import app from '../../app.js';
import { resetDatabase, getTestPrisma } from '../../test/setup.js';
import {
  makeRequest,
  makeAuthenticatedRequest,
  createTestUser,
  createAccessToken,
} from '../../test/helpers.js';
import { generateToken, hashToken } from '@repo/auth';

// Use the full app which includes all routes (login, me, etc.)
const testApp = app;

// Helper to create API token directly in database
async function createApiToken(
  userId: string,
  profileId: string,
  options: {
    name: string;
    scopes: string[];
    expiresInDays?: number;
  }
) {
  const prisma = getTestPrisma();
  const token = generateToken();
  const last4 = token.slice(-4);
  const keyHash = hashToken(token);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (options.expiresInDays || 90));

  const apiKey = await prisma.apiKey.create({
    data: {
      userId,
      profileId,
      name: options.name,
      keyHash,
      last4,
      scopes: options.scopes,
      expiresAt,
    },
  });

  return { apiKey, token };
}

describe('Scope Enforcement Middleware', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('Profile Endpoints - read:profile scope', () => {
    it('should allow session auth to access GET /v1/me without scope check', async () => {
      const { user } = await createTestUser({
        name: 'Test User',
      });

      const { token } = await createAccessToken(user.id);

      // Make request with session auth (should bypass scope check)
      const response = await makeAuthenticatedRequest(
        testApp,
        'GET',
        '/v1/me',
        token
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.user.id).toBe(user.id);
      expect(data.user.email).toBe(user.email);
    });

    it('should allow PAT with read:profile scope to access GET /v1/me', async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create token with read:profile scope
      const { token } = await createApiToken(user.id, profile!.id, {
        name: 'Read Profile Token',
        scopes: ['read:profile'],
      });

      // Make request with Bearer token
      const response = await makeRequest(testApp, 'GET', '/v1/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.user.id).toBe(user.id);
    });

    it('should deny PAT without read:profile scope from accessing GET /v1/me', async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create token without read:profile scope
      const { token } = await createApiToken(user.id, profile!.id, {
        name: 'Write Only Token',
        scopes: ['write:transactions'],
      });

      // Make request with Bearer token
      const response = await makeRequest(testApp, 'GET', '/v1/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data.error).toBe('Insufficient permissions');
      expect(data.required).toBe('read:profile');
    });

    it('should allow PAT with admin scope to access GET /v1/me', async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create token with admin scope (grants all permissions)
      const { token } = await createApiToken(user.id, profile!.id, {
        name: 'Admin Token',
        scopes: ['admin'],
      });

      // Make request with Bearer token
      const response = await makeRequest(testApp, 'GET', '/v1/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.user.id).toBe(user.id);
    });
  });

  describe('Profile Endpoints - write:profile scope', () => {
    it('should allow session auth to access PATCH /v1/me without scope check', async () => {
      const { user } = await createTestUser({
        name: 'Test User',
      });

      const { token } = await createAccessToken(user.id);

      // Make request with session auth (should bypass scope check)
      const response = await makeAuthenticatedRequest(
        testApp,
        'PATCH',
        '/v1/me',
        token,
        {
          body: {
            name: 'Updated Name',
            timezone: 'America/New_York',
          },
        }
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.user.name).toBe('Updated Name');
      expect(data.user.profile.timezone).toBe('America/New_York');
    });

    it('should allow PAT with write:profile scope to access PATCH /v1/me', async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create token with write:profile scope
      const { token } = await createApiToken(user.id, profile!.id, {
        name: 'Write Profile Token',
        scopes: ['write:profile'],
      });

      // Make request with Bearer token
      const response = await makeRequest(testApp, 'PATCH', '/v1/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: {
          name: 'Updated via PAT',
        },
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.user.name).toBe('Updated via PAT');
    });

    it('should deny PAT with only read:profile scope from accessing PATCH /v1/me', async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create token with only read:profile scope
      const { token } = await createApiToken(user.id, profile!.id, {
        name: 'Read Only Token',
        scopes: ['read:profile'],
      });

      // Make request with Bearer token
      const response = await makeRequest(testApp, 'PATCH', '/v1/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: {
          name: 'Should Fail',
        },
      });

      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data.error).toBe('Insufficient permissions');
      expect(data.required).toBe('write:profile');
    });

    it('should deny PAT without write:profile scope from accessing PATCH /v1/me', async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create token without write:profile scope
      const { token } = await createApiToken(user.id, profile!.id, {
        name: 'Wrong Scope Token',
        scopes: ['read:transactions', 'write:transactions'],
      });

      // Make request with Bearer token
      const response = await makeRequest(testApp, 'PATCH', '/v1/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: {
          name: 'Should Fail',
        },
      });

      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data.error).toBe('Insufficient permissions');
      expect(data.required).toBe('write:profile');
    });
  });

  describe('Multiple Scopes', () => {
    it('should allow PAT with multiple scopes including required scope', async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create token with multiple scopes
      const { token } = await createApiToken(user.id, profile!.id, {
        name: 'Multi-Scope Token',
        scopes: ['read:profile', 'write:profile', 'read:transactions'],
      });

      // Test read access
      const readResponse = await makeRequest(testApp, 'GET', '/v1/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(readResponse.status).toBe(200);

      // Test write access
      const writeResponse = await makeRequest(testApp, 'PATCH', '/v1/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: {
          name: 'Updated Name',
        },
      });

      expect(writeResponse.status).toBe(200);
    });

    it('should deny PAT with multiple scopes but missing required scope', async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create token with multiple scopes but not read:profile
      const { token } = await createApiToken(user.id, profile!.id, {
        name: 'Wrong Scopes Token',
        scopes: ['read:transactions', 'write:transactions', 'read:budgets'],
      });

      // Make request with Bearer token
      const response = await makeRequest(testApp, 'GET', '/v1/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data.error).toBe('Insufficient permissions');
      expect(data.required).toBe('read:profile');
    });
  });

  describe('Error Response Format', () => {
    it('should return 403 with error and required scope in response', async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create token without required scope
      const { token } = await createApiToken(user.id, profile!.id, {
        name: 'Limited Token',
        scopes: ['read:transactions'],
      });

      // Make request with Bearer token
      const response = await makeRequest(testApp, 'GET', '/v1/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('required');
      expect(data.error).toBe('Insufficient permissions');
      expect(data.required).toBe('read:profile');
    });
  });

  describe('Session vs PAT Auth Behavior', () => {
    it('should allow session auth full access regardless of endpoint scope', async () => {
      const { user } = await createTestUser();
      const { token } = await createAccessToken(user.id);

      // Test read endpoint
      const readResponse = await makeAuthenticatedRequest(
        testApp,
        'GET',
        '/v1/me',
        token
      );
      expect(readResponse.status).toBe(200);

      // Test write endpoint
      const writeResponse = await makeAuthenticatedRequest(
        testApp,
        'PATCH',
        '/v1/me',
        token,
        {
          body: {
            name: 'Updated Name',
          },
        }
      );
      expect(writeResponse.status).toBe(200);
    });

    it('should enforce scopes for PAT auth but not session auth', async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create read-only token
      const { token } = await createApiToken(user.id, profile!.id, {
        name: 'Read Only Token',
        scopes: ['read:profile'],
      });

      // PAT should be denied write access
      const patWriteResponse = await makeRequest(testApp, 'PATCH', '/v1/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: {
          name: 'Should Fail',
        },
      });
      expect(patWriteResponse.status).toBe(403);

      // Session should have write access
      const { token: sessionToken } = await createAccessToken(user.id);

      const sessionWriteResponse = await makeAuthenticatedRequest(
        testApp,
        'PATCH',
        '/v1/me',
        sessionToken,
        {
          body: {
            name: 'Should Succeed',
          },
        }
      );
      expect(sessionWriteResponse.status).toBe(200);
    });
  });
});

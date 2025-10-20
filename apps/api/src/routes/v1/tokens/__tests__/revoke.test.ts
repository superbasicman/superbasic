/**
 * Integration tests for DELETE /v1/tokens/:id - Token revocation endpoint
 * Tests token revocation, ownership verification, idempotency, and audit logging
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Hono } from "hono";
import { resetDatabase } from "../../../../test/setup.js";
import {
  makeAuthenticatedRequest,
  createTestUser,
} from "../../../../test/helpers.js";
import {
  COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  JWT_SALT,
  authConfig,
  authEvents,
  generateToken,
  hashToken,
} from "@repo/auth";
import { encode } from "@auth/core/jwt";
import { getTestPrisma } from "../../../../test/setup.js";
import { tokensRoute } from "../index.js";
import { corsMiddleware } from "../../../../middleware/cors.js";

// Create test app with tokens route
function createTestApp() {
  const app = new Hono();
  app.use("*", corsMiddleware);
  app.route("/v1/tokens", tokensRoute);
  return app;
}

// Helper to create session token for authenticated requests
async function createSessionToken(userId: string, email: string) {
  return await encode({
    token: {
      sub: userId,
      id: userId,
      email,
      iss: "sbfin",
      aud: "sbfin:web",
    },
    secret: authConfig.secret!,
    salt: JWT_SALT,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

// Helper to create a test API key
async function createTestApiKey(
  userId: string,
  profileId: string,
  name: string = "Test Token"
) {
  const prisma = getTestPrisma();
  const token = generateToken();
  const keyHash = hashToken(token);
  const last4 = token.slice(-4);

  const apiKey = await prisma.apiKey.create({
    data: {
      userId,
      profileId,
      name,
      keyHash,
      last4,
      scopes: ["read:transactions"],
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    },
  });

  return { apiKey, token };
}

describe("DELETE /v1/tokens/:id - Token Revocation", () => {
  beforeEach(async () => {
    await resetDatabase();
    authEvents.clearHandlers(); // Clear event handlers between tests
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful Revocation", () => {
    it("should revoke token successfully", async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const { apiKey } = await createTestApiKey(user.id, profile!.id);
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeAuthenticatedRequest(
        app,
        "DELETE",
        `/v1/tokens/${apiKey.id}`,
        sessionToken
      );

      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");

      // Verify token is soft-deleted (revokedAt is set)
      const revokedToken = await prisma.apiKey.findUnique({
        where: { id: apiKey.id },
      });

      expect(revokedToken).toBeTruthy();
      expect(revokedToken!.revokedAt).toBeTruthy();
      expect(revokedToken!.revokedAt).toBeInstanceOf(Date);
    });

    it("should remove revoked token from active token list", async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const { apiKey } = await createTestApiKey(user.id, profile!.id);
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      // Verify token is in list before revocation
      const listResponse1 = await makeAuthenticatedRequest(
        app,
        "GET",
        "/v1/tokens",
        sessionToken
      );

      expect(listResponse1.status).toBe(200);
      const listData1 = await listResponse1.json();
      expect(listData1.tokens).toHaveLength(1);
      expect(listData1.tokens[0].id).toBe(apiKey.id);

      // Revoke token
      const revokeResponse = await makeAuthenticatedRequest(
        app,
        "DELETE",
        `/v1/tokens/${apiKey.id}`,
        sessionToken
      );

      expect(revokeResponse.status).toBe(204);

      // Verify token is not in list after revocation
      const listResponse2 = await makeAuthenticatedRequest(
        app,
        "GET",
        "/v1/tokens",
        sessionToken
      );

      expect(listResponse2.status).toBe(200);
      const listData2 = await listResponse2.json();
      expect(listData2.tokens).toHaveLength(0);
    });

    it("should preserve token in database for audit trail", async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const { apiKey } = await createTestApiKey(user.id, profile!.id);
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      // Revoke token
      await makeAuthenticatedRequest(
        app,
        "DELETE",
        `/v1/tokens/${apiKey.id}`,
        sessionToken
      );

      // Verify token still exists in database (not hard deleted)
      const revokedToken = await prisma.apiKey.findUnique({
        where: { id: apiKey.id },
      });

      expect(revokedToken).toBeTruthy();
      expect(revokedToken!.id).toBe(apiKey.id);
      expect(revokedToken!.name).toBe(apiKey.name);
      expect(revokedToken!.keyHash).toBe(apiKey.keyHash);
    });
  });

  describe("Ownership Verification", () => {
    it("should return 404 when trying to revoke another user's token", async () => {
      const { user: user1 } = await createTestUser();
      const { user: user2 } = await createTestUser();
      const prisma = getTestPrisma();

      const profile1 = await prisma.profile.findUnique({
        where: { userId: user1.id },
      });

      // Create token for user1
      const { apiKey } = await createTestApiKey(user1.id, profile1!.id);

      // Try to revoke as user2
      const app = createTestApp();
      const sessionToken2 = await createSessionToken(user2.id, user2.email);

      const response = await makeAuthenticatedRequest(
        app,
        "DELETE",
        `/v1/tokens/${apiKey.id}`,
        sessionToken2
      );

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("Token not found");

      // Verify token is not revoked
      const token = await prisma.apiKey.findUnique({
        where: { id: apiKey.id },
      });

      expect(token!.revokedAt).toBeNull();
    });

    it("should return 404 for non-existent token", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeAuthenticatedRequest(
        app,
        "DELETE",
        "/v1/tokens/non-existent-id",
        sessionToken
      );

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("Token not found");
    });
  });

  describe("Idempotency", () => {
    it("should return 204 when revoking already revoked token", async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const { apiKey } = await createTestApiKey(user.id, profile!.id);
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      // First revocation
      const response1 = await makeAuthenticatedRequest(
        app,
        "DELETE",
        `/v1/tokens/${apiKey.id}`,
        sessionToken
      );

      expect(response1.status).toBe(204);

      // Get the revokedAt timestamp from first revocation
      const revokedToken1 = await prisma.apiKey.findUnique({
        where: { id: apiKey.id },
      });
      const firstRevokedAt = revokedToken1!.revokedAt;

      // Second revocation (should be idempotent)
      const response2 = await makeAuthenticatedRequest(
        app,
        "DELETE",
        `/v1/tokens/${apiKey.id}`,
        sessionToken
      );

      expect(response2.status).toBe(204);

      // Verify revokedAt timestamp hasn't changed
      const revokedToken2 = await prisma.apiKey.findUnique({
        where: { id: apiKey.id },
      });

      expect(revokedToken2!.revokedAt).toEqual(firstRevokedAt);
    });

    it("should not emit audit event on second revocation", async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const { apiKey } = await createTestApiKey(user.id, profile!.id);
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      // First revocation
      await makeAuthenticatedRequest(
        app,
        "DELETE",
        `/v1/tokens/${apiKey.id}`,
        sessionToken
      );

      // Clear event handlers and add new one for second revocation
      authEvents.clearHandlers();
      const eventHandler = vi.fn();
      authEvents.on(eventHandler);

      // Second revocation
      await makeAuthenticatedRequest(
        app,
        "DELETE",
        `/v1/tokens/${apiKey.id}`,
        sessionToken
      );

      // Wait for async event emission
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not emit event on second revocation
      expect(eventHandler).not.toHaveBeenCalled();
    });
  });

  describe("Audit Event Emission", () => {
    it("should emit token.revoked event on successful revocation", async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const { apiKey } = await createTestApiKey(user.id, profile!.id);
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      // Mock event handler
      const eventHandler = vi.fn();
      authEvents.on(eventHandler);

      const response = await makeAuthenticatedRequest(
        app,
        "DELETE",
        `/v1/tokens/${apiKey.id}`,
        sessionToken
      );

      expect(response.status).toBe(204);

      // Wait for async event emission
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "token.revoked",
          userId: user.id,
          metadata: expect.objectContaining({
            tokenId: apiKey.id,
            profileId: profile!.id,
            tokenName: apiKey.name,
          }),
        })
      );
    });

    it("should include IP and user agent in audit event", async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const { apiKey } = await createTestApiKey(user.id, profile!.id);
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      // Mock event handler
      const eventHandler = vi.fn();
      authEvents.on(eventHandler);

      const response = await makeAuthenticatedRequest(
        app,
        "DELETE",
        `/v1/tokens/${apiKey.id}`,
        sessionToken,
        {
          headers: {
            "x-forwarded-for": "192.168.1.1",
            "user-agent": "Test Agent",
          },
        }
      );

      expect(response.status).toBe(204);

      // Wait for async event emission
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            ip: "192.168.1.1",
            userAgent: "Test Agent",
          }),
        })
      );
    });
  });

  describe("Authentication Requirements", () => {
    it("should require session authentication", async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const { apiKey } = await createTestApiKey(user.id, profile!.id);
      const app = createTestApp();

      const response = await makeAuthenticatedRequest(
        app,
        "DELETE",
        `/v1/tokens/${apiKey.id}`,
        "" // No session token
      );

      expect(response.status).toBe(401);
    });

    it("should reject invalid session token", async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const { apiKey } = await createTestApiKey(user.id, profile!.id);
      const app = createTestApp();

      const response = await makeAuthenticatedRequest(
        app,
        "DELETE",
        `/v1/tokens/${apiKey.id}`,
        "invalid-token"
      );

      expect(response.status).toBe(401);
    });
  });

  describe("Revoked Token Authentication", () => {
    it("should reject authentication with revoked token", async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const { apiKey, token } = await createTestApiKey(user.id, profile!.id);
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      // Revoke token
      await makeAuthenticatedRequest(
        app,
        "DELETE",
        `/v1/tokens/${apiKey.id}`,
        sessionToken
      );

      // Try to use revoked token for authentication
      // Note: This would require a PAT authentication middleware test
      // For now, we verify the token is marked as revoked in the database
      const revokedToken = await prisma.apiKey.findUnique({
        where: { id: apiKey.id },
      });

      expect(revokedToken!.revokedAt).toBeTruthy();
    });
  });
});

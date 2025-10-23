/**
 * Integration tests for PATCH /v1/tokens/:id - Token name update endpoint
 * Tests token name updates, duplicate name rejection, ownership verification, and token functionality
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Unmock @repo/database for integration tests (use real Prisma client)
vi.unmock('@repo/database');

import { Hono } from "hono";
import { resetDatabase } from "../../../../test/setup.js";
import {
  makeAuthenticatedRequest,
  createTestUser,
} from "../../../../test/helpers.js";
import {
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

describe("PATCH /v1/tokens/:id - Token Name Update", () => {
  beforeEach(async () => {
    await resetDatabase();
    authEvents.clearHandlers(); // Clear event handlers between tests
  });

  describe("Successful Name Update", () => {
    it("should update token name successfully", async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const { apiKey } = await createTestApiKey(user.id, profile!.id, "Old Name");
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeAuthenticatedRequest(
        app,
        "PATCH",
        `/v1/tokens/${apiKey.id}`,
        sessionToken,
        {
          body: { name: "New Name" },
        }
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.id).toBe(apiKey.id);
      expect(data.name).toBe("New Name");
      expect(data.scopes).toEqual(["read:transactions"]);
      expect(data.maskedToken).toBe(`sbf_****${apiKey.last4}`);

      // Verify database was updated
      const updatedToken = await prisma.apiKey.findUnique({
        where: { id: apiKey.id },
      });

      expect(updatedToken!.name).toBe("New Name");
    });

    it("should preserve all other token fields", async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const { apiKey } = await createTestApiKey(user.id, profile!.id, "Original Name");
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeAuthenticatedRequest(
        app,
        "PATCH",
        `/v1/tokens/${apiKey.id}`,
        sessionToken,
        {
          body: { name: "Updated Name" },
        }
      );

      expect(response.status).toBe(200);

      // Verify all fields are preserved
      const updatedToken = await prisma.apiKey.findUnique({
        where: { id: apiKey.id },
      });

      expect(updatedToken!.keyHash).toBe(apiKey.keyHash);
      expect(updatedToken!.last4).toBe(apiKey.last4);
      expect(updatedToken!.userId).toBe(apiKey.userId);
      expect(updatedToken!.profileId).toBe(apiKey.profileId);
      expect(updatedToken!.scopes).toEqual(apiKey.scopes);
      expect(updatedToken!.expiresAt).toEqual(apiKey.expiresAt);
      expect(updatedToken!.revokedAt).toBeNull();
    });

    it("should return updated token metadata in response", async () => {
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
        "PATCH",
        `/v1/tokens/${apiKey.id}`,
        sessionToken,
        {
          body: { name: "Updated Token" },
        }
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty("id");
      expect(data).toHaveProperty("name");
      expect(data).toHaveProperty("scopes");
      expect(data).toHaveProperty("createdAt");
      expect(data).toHaveProperty("lastUsedAt");
      expect(data).toHaveProperty("expiresAt");
      expect(data).toHaveProperty("maskedToken");
      expect(data.name).toBe("Updated Token");
    });
  });

  describe("Duplicate Name Rejection", () => {
    it("should reject duplicate name for same user", async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create two tokens with different names
      await createTestApiKey(user.id, profile!.id, "Token 1");
      const { apiKey: token2 } = await createTestApiKey(user.id, profile!.id, "Token 2");

      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      // Try to rename token2 to token1's name
      const response = await makeAuthenticatedRequest(
        app,
        "PATCH",
        `/v1/tokens/${token2.id}`,
        sessionToken,
        {
          body: { name: "Token 1" },
        }
      );

      expect(response.status).toBe(409);

      const data = await response.json();
      expect(data.error).toBe("Token name already exists");

      // Verify token2 name was not changed
      const unchangedToken = await prisma.apiKey.findUnique({
        where: { id: token2.id },
      });

      expect(unchangedToken!.name).toBe("Token 2");
    });

    it("should allow updating to same name (no-op)", async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const { apiKey } = await createTestApiKey(user.id, profile!.id, "Same Name");
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      // Update to same name (should succeed)
      const response = await makeAuthenticatedRequest(
        app,
        "PATCH",
        `/v1/tokens/${apiKey.id}`,
        sessionToken,
        {
          body: { name: "Same Name" },
        }
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.name).toBe("Same Name");
    });

    it("should allow same name for different users", async () => {
      const { user: user1 } = await createTestUser();
      const { user: user2 } = await createTestUser();
      const prisma = getTestPrisma();

      const profile1 = await prisma.profile.findUnique({
        where: { userId: user1.id },
      });
      const profile2 = await prisma.profile.findUnique({
        where: { userId: user2.id },
      });

      // Create token for user1 with name "Shared Name"
      await createTestApiKey(user1.id, profile1!.id, "Shared Name");

      // Create token for user2 with different name
      const { apiKey: token2 } = await createTestApiKey(user2.id, profile2!.id, "Different Name");

      const app = createTestApp();
      const sessionToken2 = await createSessionToken(user2.id, user2.email);

      // Update user2's token to "Shared Name" (should succeed)
      const response = await makeAuthenticatedRequest(
        app,
        "PATCH",
        `/v1/tokens/${token2.id}`,
        sessionToken2,
        {
          body: { name: "Shared Name" },
        }
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.name).toBe("Shared Name");
    });
  });

  describe("Ownership Verification", () => {
    it("should return 404 when trying to update another user's token", async () => {
      const { user: user1 } = await createTestUser();
      const { user: user2 } = await createTestUser();
      const prisma = getTestPrisma();

      const profile1 = await prisma.profile.findUnique({
        where: { userId: user1.id },
      });

      // Create token for user1
      const { apiKey } = await createTestApiKey(user1.id, profile1!.id, "User1 Token");

      // Try to update as user2
      const app = createTestApp();
      const sessionToken2 = await createSessionToken(user2.id, user2.email);

      const response = await makeAuthenticatedRequest(
        app,
        "PATCH",
        `/v1/tokens/${apiKey.id}`,
        sessionToken2,
        {
          body: { name: "Hacked Name" },
        }
      );

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("Token not found");

      // Verify token name was not changed
      const unchangedToken = await prisma.apiKey.findUnique({
        where: { id: apiKey.id },
      });

      expect(unchangedToken!.name).toBe("User1 Token");
    });

    it("should return 404 for non-existent token", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeAuthenticatedRequest(
        app,
        "PATCH",
        "/v1/tokens/non-existent-id",
        sessionToken,
        {
          body: { name: "New Name" },
        }
      );

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("Token not found");
    });

    it("should return 404 for revoked token", async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const { apiKey } = await createTestApiKey(user.id, profile!.id, "Revoked Token");

      // Revoke the token
      await prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { revokedAt: new Date() },
      });

      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeAuthenticatedRequest(
        app,
        "PATCH",
        `/v1/tokens/${apiKey.id}`,
        sessionToken,
        {
          body: { name: "New Name" },
        }
      );

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("Token not found");
    });
  });

  describe("Token Functionality After Update", () => {
    it("should allow token to authenticate after name change", async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const { apiKey, token } = await createTestApiKey(user.id, profile!.id, "Original Name");
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      // Update token name
      const updateResponse = await makeAuthenticatedRequest(
        app,
        "PATCH",
        `/v1/tokens/${apiKey.id}`,
        sessionToken,
        {
          body: { name: "Updated Name" },
        }
      );

      expect(updateResponse.status).toBe(200);

      // Verify token hash is unchanged
      const updatedToken = await prisma.apiKey.findUnique({
        where: { id: apiKey.id },
      });

      expect(updatedToken!.keyHash).toBe(apiKey.keyHash);
      expect(updatedToken!.name).toBe("Updated Name");

      // Verify the plaintext token still hashes to the same value
      const tokenHash = hashToken(token);
      expect(tokenHash).toBe(updatedToken!.keyHash);
    });

    it("should preserve token scopes after name change", async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const { apiKey } = await createTestApiKey(user.id, profile!.id, "Original Name");
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      // Update token name
      await makeAuthenticatedRequest(
        app,
        "PATCH",
        `/v1/tokens/${apiKey.id}`,
        sessionToken,
        {
          body: { name: "Updated Name" },
        }
      );

      // Verify scopes are unchanged
      const updatedToken = await prisma.apiKey.findUnique({
        where: { id: apiKey.id },
      });

      expect(updatedToken!.scopes).toEqual(apiKey.scopes);
    });

    it("should preserve token expiration after name change", async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const { apiKey } = await createTestApiKey(user.id, profile!.id, "Original Name");
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      // Update token name
      await makeAuthenticatedRequest(
        app,
        "PATCH",
        `/v1/tokens/${apiKey.id}`,
        sessionToken,
        {
          body: { name: "Updated Name" },
        }
      );

      // Verify expiration is unchanged
      const updatedToken = await prisma.apiKey.findUnique({
        where: { id: apiKey.id },
      });

      expect(updatedToken!.expiresAt).toEqual(apiKey.expiresAt);
    });
  });

  describe("Validation", () => {
    it("should reject empty name", async () => {
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
        "PATCH",
        `/v1/tokens/${apiKey.id}`,
        sessionToken,
        {
          body: { name: "" },
        }
      );

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe("Validation failed");
    });

    it("should reject name longer than 100 characters", async () => {
      const { user } = await createTestUser();
      const prisma = getTestPrisma();
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const { apiKey } = await createTestApiKey(user.id, profile!.id);
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      const longName = "a".repeat(101);

      const response = await makeAuthenticatedRequest(
        app,
        "PATCH",
        `/v1/tokens/${apiKey.id}`,
        sessionToken,
        {
          body: { name: longName },
        }
      );

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe("Validation failed");
    });

    it("should trim whitespace from name", async () => {
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
        "PATCH",
        `/v1/tokens/${apiKey.id}`,
        sessionToken,
        {
          body: { name: "  Trimmed Name  " },
        }
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.name).toBe("Trimmed Name");
    });

    it("should reject missing name field", async () => {
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
        "PATCH",
        `/v1/tokens/${apiKey.id}`,
        sessionToken,
        {
          body: {},
        }
      );

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe("Validation failed");
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
        "PATCH",
        `/v1/tokens/${apiKey.id}`,
        "", // No session token
        {
          body: { name: "New Name" },
        }
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
        "PATCH",
        `/v1/tokens/${apiKey.id}`,
        "invalid-token",
        {
          body: { name: "New Name" },
        }
      );

      expect(response.status).toBe(401);
    });
  });
});

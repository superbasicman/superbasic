/**
 * Integration tests for POST /v1/tokens - Token creation endpoint
 * Tests token generation, validation, rate limiting, and audit logging
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

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
  isValidTokenFormat,
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

describe("POST /v1/tokens - Token Creation", () => {
  beforeEach(async () => {
    await resetDatabase();
    authEvents.clearHandlers(); // Clear event handlers between tests
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful Token Creation", () => {
    it("should create token with valid request", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken,
        {
          body: {
            name: "Test Token",
            scopes: ["read:transactions"],
            expiresInDays: 90,
          },
        }
      );

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data).toHaveProperty("token");
      expect(data).toHaveProperty("id");
      expect(data).toHaveProperty("name", "Test Token");
      expect(data).toHaveProperty("scopes");
      expect(data.scopes).toEqual(["read:transactions"]);
      expect(data).toHaveProperty("createdAt");
      expect(data).toHaveProperty("lastUsedAt", null);
      expect(data).toHaveProperty("expiresAt");
      expect(data).toHaveProperty("maskedToken");

      // Verify token format
      expect(isValidTokenFormat(data.token)).toBe(true);
      expect(data.token).toMatch(/^sbf_[A-Za-z0-9_-]{43}$/);

      // Verify masked token format
      expect(data.maskedToken).toMatch(/^sbf_\*\*\*\*[A-Za-z0-9_-]{4}$/);
      expect(data.maskedToken.slice(-4)).toBe(data.token.slice(-4));
    });

    it("should store token hash in database (not plaintext)", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);
      const prisma = getTestPrisma();

      const response = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken,
        {
          body: {
            name: "Test Token",
            scopes: ["read:transactions"],
          },
        }
      );

      expect(response.status).toBe(201);

      const data = await response.json();
      const plaintextToken = data.token;

      // Verify token is stored as hash
      const storedToken = await prisma.apiKey.findUnique({
        where: { id: data.id },
      });

      expect(storedToken).toBeTruthy();
      expect(storedToken!.keyHash).not.toBe(plaintextToken);
      expect(storedToken!.keyHash).toBe(hashToken(plaintextToken));
      expect(storedToken!.keyHash).toHaveLength(64); // SHA-256 hex = 64 chars
    });

    it("should store last 4 characters for display", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);
      const prisma = getTestPrisma();

      const response = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken,
        {
          body: {
            name: "Test Token",
            scopes: ["read:transactions"],
          },
        }
      );

      expect(response.status).toBe(201);

      const data = await response.json();
      const plaintextToken = data.token;

      // Verify last4 is stored correctly
      const storedToken = await prisma.apiKey.findUnique({
        where: { id: data.id },
      });

      expect(storedToken!.last4).toBe(plaintextToken.slice(-4));
      expect(storedToken!.last4).toHaveLength(4);
    });

    it("should create token with multiple scopes", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken,
        {
          body: {
            name: "Multi-Scope Token",
            scopes: ["read:transactions", "write:transactions", "read:budgets"],
          },
        }
      );

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.scopes).toEqual([
        "read:transactions",
        "write:transactions",
        "read:budgets",
      ]);
    });

    it("should create token with custom expiration", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken,
        {
          body: {
            name: "Short-Lived Token",
            scopes: ["read:transactions"],
            expiresInDays: 30,
          },
        }
      );

      expect(response.status).toBe(201);

      const data = await response.json();
      const expiresAt = new Date(data.expiresAt);
      const now = new Date();
      const daysDiff = Math.round(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysDiff).toBe(30);
    });

    it("should use default 90-day expiration when not specified", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken,
        {
          body: {
            name: "Default Expiration Token",
            scopes: ["read:transactions"],
          },
        }
      );

      expect(response.status).toBe(201);

      const data = await response.json();
      const expiresAt = new Date(data.expiresAt);
      const now = new Date();
      const daysDiff = Math.round(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysDiff).toBe(90);
    });

    it("should associate token with userId and profileId", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);
      const prisma = getTestPrisma();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const response = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken,
        {
          body: {
            name: "Test Token",
            scopes: ["read:transactions"],
          },
        }
      );

      expect(response.status).toBe(201);

      const data = await response.json();
      const storedToken = await prisma.apiKey.findUnique({
        where: { id: data.id },
      });

      expect(storedToken!.userId).toBe(user.id);
      expect(storedToken!.profileId).toBe(profile!.id);
    });
  });

  describe("Validation Errors", () => {
    it("should reject token with empty name", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken,
        {
          body: {
            name: "",
            scopes: ["read:transactions"],
          },
        }
      );

      expect(response.status).toBe(400);
    });

    it("should reject token with name exceeding 100 characters", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken,
        {
          body: {
            name: "a".repeat(101),
            scopes: ["read:transactions"],
          },
        }
      );

      expect(response.status).toBe(400);
    });

    it("should reject token with no scopes", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken,
        {
          body: {
            name: "Test Token",
            scopes: [],
          },
        }
      );

      expect(response.status).toBe(400);
    });

    it("should reject token with invalid scope", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken,
        {
          body: {
            name: "Test Token",
            scopes: ["invalid:scope"],
          },
        }
      );

      expect(response.status).toBe(400);
    });

    it("should reject token with duplicate scopes", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken,
        {
          body: {
            name: "Test Token",
            scopes: ["read:transactions", "read:transactions"],
          },
        }
      );

      expect(response.status).toBe(400);
    });

    it("should reject token with expiration less than 1 day", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken,
        {
          body: {
            name: "Test Token",
            scopes: ["read:transactions"],
            expiresInDays: 0,
          },
        }
      );

      expect(response.status).toBe(400);
    });

    it("should reject token with expiration exceeding 365 days", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken,
        {
          body: {
            name: "Test Token",
            scopes: ["read:transactions"],
            expiresInDays: 366,
          },
        }
      );

      expect(response.status).toBe(400);
    });

    it("should reject token with non-integer expiration", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken,
        {
          body: {
            name: "Test Token",
            scopes: ["read:transactions"],
            expiresInDays: 30.5,
          },
        }
      );

      expect(response.status).toBe(400);
    });
  });

  describe("Duplicate Name Rejection", () => {
    it("should reject token with duplicate name for same user", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      // Create first token
      const response1 = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken,
        {
          body: {
            name: "My Token",
            scopes: ["read:transactions"],
          },
        }
      );

      expect(response1.status).toBe(201);

      // Try to create second token with same name
      const response2 = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken,
        {
          body: {
            name: "My Token",
            scopes: ["write:transactions"],
          },
        }
      );

      expect(response2.status).toBe(409);

      const data = await response2.json();
      expect(data.error).toBe("Token name already exists");
    });

    it("should allow same token name for different users", async () => {
      const { user: user1 } = await createTestUser();
      const { user: user2 } = await createTestUser();
      const app = createTestApp();

      const sessionToken1 = await createSessionToken(user1.id, user1.email);
      const sessionToken2 = await createSessionToken(user2.id, user2.email);

      // Create token for user 1
      const response1 = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken1,
        {
          body: {
            name: "Shared Name",
            scopes: ["read:transactions"],
          },
        }
      );

      expect(response1.status).toBe(201);

      // Create token with same name for user 2
      const response2 = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken2,
        {
          body: {
            name: "Shared Name",
            scopes: ["read:transactions"],
          },
        }
      );

      expect(response2.status).toBe(201);
    });
  });

  describe("Authentication Requirements", () => {
    it("should require session authentication", async () => {
      const app = createTestApp();

      const response = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        "", // No session token
        {
          body: {
            name: "Test Token",
            scopes: ["read:transactions"],
          },
        }
      );

      expect(response.status).toBe(401);
    });

    it("should reject invalid session token", async () => {
      const app = createTestApp();

      const response = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        "invalid-token",
        {
          body: {
            name: "Test Token",
            scopes: ["read:transactions"],
          },
        }
      );

      expect(response.status).toBe(401);
    });
  });

  describe("Audit Event Emission", () => {
    it("should emit token.created event on successful creation", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      // Mock event handler
      const eventHandler = vi.fn();
      authEvents.on(eventHandler);

      const response = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken,
        {
          body: {
            name: "Test Token",
            scopes: ["read:transactions"],
          },
        }
      );

      expect(response.status).toBe(201);

      // Wait for async event emission
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "token.created",
          userId: user.id,
          metadata: expect.objectContaining({
            tokenName: "Test Token",
            scopes: ["read:transactions"],
          }),
        })
      );
    });

    it("should include IP and user agent in audit event", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      // Mock event handler
      const eventHandler = vi.fn();
      authEvents.on(eventHandler);

      const response = await makeAuthenticatedRequest(
        app,
        "POST",
        "/v1/tokens",
        sessionToken,
        {
          body: {
            name: "Test Token",
            scopes: ["read:transactions"],
          },
          headers: {
            "x-forwarded-for": "192.168.1.1",
            "user-agent": "Test Agent",
          },
        }
      );

      expect(response.status).toBe(201);

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
});

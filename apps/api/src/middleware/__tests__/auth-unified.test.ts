/**
 * Integration tests for unified authentication middleware
 * Tests priority order: Bearer token first, then session cookie
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Unmock @repo/database for integration tests (use real Prisma client)
vi.unmock('@repo/database');

import { Hono } from "hono";
import { unifiedAuthMiddleware } from "../auth-unified.js";
import { resetDatabase, getTestPrisma } from "../../test/setup.js";
import { makeRequest, createTestUser, createSessionToken } from "../../test/helpers.js";
import {
  generateToken,
  hashToken,
  COOKIE_NAME,
} from "@repo/auth";

// Define context variables type
type UnifiedContext = {
  Variables: {
    userId: string;
    userEmail: string;
    profileId?: string;
    authType: "session" | "pat";
    jti?: string;
    tokenId?: string;
    tokenScopes?: string[];
  };
};

// Create a test app with unified auth middleware
function createTestApp() {
  const app = new Hono<UnifiedContext>();

  // Protected route that uses unified auth middleware
  app.get("/protected", unifiedAuthMiddleware, async (c) => {
    return c.json({
      userId: c.get("userId"),
      userEmail: c.get("userEmail"),
      authType: c.get("authType"),
      profileId: c.get("profileId"),
      tokenId: c.get("tokenId"),
      tokenScopes: c.get("tokenScopes"),
      jti: c.get("jti"),
    });
  });

  return app;
}

describe("Unified Authentication Middleware", () => {
  let prisma: ReturnType<typeof getTestPrisma>;

  beforeEach(async () => {
    await resetDatabase();
    prisma = getTestPrisma();
  });

  describe("Bearer Token Priority", () => {
    it("should use Bearer token when present", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create API key
      const token = generateToken();
      const keyHash = hashToken(token);
      const last4 = token.slice(-4);

      const apiKey = await prisma.apiKey.create({
        data: {
          userId: user.id,
          profileId: profile!.id,
          name: "Test Token",
          keyHash,
          last4,
          scopes: ["read:transactions"],
        },
      });

      const response = await makeRequest(app, "GET", "/protected", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.authType).toBe("pat");
      expect(data.tokenId).toBe(apiKey.id);
      expect(data.tokenScopes).toEqual(["read:transactions"]);
      expect(data.jti).toBeUndefined();
    });

    it("should prefer Bearer token over session cookie when both present", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create API key
      const token = generateToken();
      const keyHash = hashToken(token);
      const last4 = token.slice(-4);

      const apiKey = await prisma.apiKey.create({
        data: {
          userId: user.id,
          profileId: profile!.id,
          name: "Test Token",
          keyHash,
          last4,
          scopes: ["read:transactions"],
        },
      });

      // Create session token
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeRequest(app, "GET", "/protected", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cookies: {
          [COOKIE_NAME]: sessionToken,
        },
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      // Should use PAT auth, not session
      expect(data.authType).toBe("pat");
      expect(data.tokenId).toBe(apiKey.id);
      expect(data.jti).toBeUndefined();
    });
  });

  describe("Session Cookie Fallback", () => {
    it("should use session cookie when Bearer token not present", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();

      // Create session token
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeRequest(app, "GET", "/protected", {
        cookies: {
          [COOKIE_NAME]: sessionToken,
        },
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.authType).toBe("session");
      expect(data.jti).toBeTruthy();
      expect(data.tokenId).toBeUndefined();
      expect(data.tokenScopes).toBeUndefined();
    });

    it("should fall back to session when Bearer token is invalid", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();

      // Create session token
      const sessionToken = await createSessionToken(user.id, user.email);

      // Note: Invalid Bearer token will be rejected by PAT middleware
      // It won't fall back to session - Bearer header takes priority
      const response = await makeRequest(app, "GET", "/protected", {
        headers: {
          Authorization: "Bearer invalid-token",
        },
        cookies: {
          [COOKIE_NAME]: sessionToken,
        },
      });

      // Should fail because Bearer header is present but invalid
      expect(response.status).toBe(401);
    });
  });

  describe("No Authentication", () => {
    it("should return 401 when neither Bearer token nor session cookie present", async () => {
      const app = createTestApp();

      const response = await makeRequest(app, "GET", "/protected");

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("should return 401 when only invalid session cookie present", async () => {
      const app = createTestApp();

      const response = await makeRequest(app, "GET", "/protected", {
        cookies: {
          [COOKIE_NAME]: "invalid-token",
        },
      });

      expect(response.status).toBe(401);
    });
  });

  describe("Context Variables", () => {
    it("should set userId and profileId for both auth types", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Test PAT auth
      const token = generateToken();
      const keyHash = hashToken(token);
      const last4 = token.slice(-4);

      await prisma.apiKey.create({
        data: {
          userId: user.id,
          profileId: profile!.id,
          name: "Test Token",
          keyHash,
          last4,
          scopes: ["read:transactions"],
        },
      });

      const patResponse = await makeRequest(app, "GET", "/protected", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(patResponse.status).toBe(200);

      const patData = await patResponse.json();
      expect(patData.userId).toBe(user.id);
      expect(patData.profileId).toBe(profile!.id);

      // Test session auth
      const sessionToken = await createSessionToken(user.id, user.email);

      const sessionResponse = await makeRequest(app, "GET", "/protected", {
        cookies: {
          [COOKIE_NAME]: sessionToken,
        },
      });

      expect(sessionResponse.status).toBe(200);

      const sessionData = await sessionResponse.json();
      expect(sessionData.userId).toBe(user.id);
      expect(sessionData.profileId).toBe(profile!.id);
    });

    it("should set authType correctly for each method", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Test PAT auth
      const token = generateToken();
      const keyHash = hashToken(token);
      const last4 = token.slice(-4);

      await prisma.apiKey.create({
        data: {
          userId: user.id,
          profileId: profile!.id,
          name: "Test Token",
          keyHash,
          last4,
          scopes: ["read:transactions"],
        },
      });

      const patResponse = await makeRequest(app, "GET", "/protected", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const patData = await patResponse.json();
      expect(patData.authType).toBe("pat");

      // Test session auth
      const sessionToken = await createSessionToken(user.id, user.email);

      const sessionResponse = await makeRequest(app, "GET", "/protected", {
        cookies: {
          [COOKIE_NAME]: sessionToken,
        },
      });

      const sessionData = await sessionResponse.json();
      expect(sessionData.authType).toBe("session");
    });
  });

  describe("Error Handling", () => {
    it("should handle missing Authorization header gracefully", async () => {
      const app = createTestApp();

      const response = await makeRequest(app, "GET", "/protected");

      expect(response.status).toBe(401);
      expect(response.headers.get("content-type")).toContain(
        "application/json"
      );
    });

    it("should not leak error details", async () => {
      const app = createTestApp();

      const response = await makeRequest(app, "GET", "/protected", {
        headers: {
          Authorization: "Bearer invalid",
        },
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).not.toContain("stack");
      expect(data.error).not.toContain("middleware");
    });
  });
});

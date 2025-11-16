/**
 * Integration tests for PAT (Personal Access Token) authentication middleware
 * Tests Bearer token extraction, validation, and user context attachment
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Unmock @repo/database for integration tests (use real Prisma client)
vi.unmock('@repo/database');

import { Hono } from "hono";
import { patMiddleware } from "../pat.js";
import { resetDatabase, getTestPrisma } from "../../test/setup.js";
import { makeRequest, createTestUser } from "../../test/helpers.js";
import { generateToken, hashToken, authEvents } from "@repo/auth";

// Define context variables type
type PatContext = {
  Variables: {
    userId: string;
    userEmail: string;
    profileId: string;
    authType: "pat";
    tokenId: string;
    tokenScopes: string[];
  };
};

// Create a test app with PAT middleware
function createTestApp() {
  const app = new Hono<PatContext>();

  // Protected route that uses PAT middleware
  app.get("/protected", patMiddleware, async (c) => {
    return c.json({
      userId: c.get("userId"),
      userEmail: c.get("userEmail"),
      profileId: c.get("profileId"),
      authType: c.get("authType"),
      tokenId: c.get("tokenId"),
      tokenScopes: c.get("tokenScopes"),
    });
  });

  return app;
}

describe("PAT Authentication Middleware", () => {
  let prisma: ReturnType<typeof getTestPrisma>;

  beforeEach(async () => {
    await resetDatabase();
    prisma = getTestPrisma();
    // Clear event handlers before each test
    authEvents.clearHandlers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Token Extraction and Validation", () => {
    it("should extract and validate Bearer token from Authorization header", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();

      // Create profile for user
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Generate token and create API key
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
      expect(data.userId).toBe(user.id);
      expect(data.userEmail).toBe(user.email);
      expect(data.profileId).toBe(profile!.id);
      expect(data.authType).toBe("pat");
      expect(data.tokenId).toBe(apiKey.id);
      expect(data.tokenScopes).toEqual(["read:transactions"]);
    });

    it("should return 401 when Authorization header is missing", async () => {
      const app = createTestApp();

      const response = await makeRequest(app, "GET", "/protected");

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty("error");
      expect(data.error).toBe("Missing or invalid Authorization header");
    });

    it("should return 401 for invalid Authorization header format", async () => {
      const app = createTestApp();

      const response = await makeRequest(app, "GET", "/protected", {
        headers: {
          Authorization: "InvalidFormat token123",
        },
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toBe("Missing or invalid Authorization header");
    });

    it("should return 401 for invalid token format", async () => {
      const app = createTestApp();

      // Track audit events
      const events: any[] = [];
      authEvents.on((event) => { events.push(event); });

      const response = await makeRequest(app, "GET", "/protected", {
        headers: {
          Authorization: "Bearer invalid-token-format",
        },
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toBe("Invalid token");

      // Verify audit event was emitted
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("token.auth_failed");
      expect(events[0].metadata.reason).toBe("invalid_format");
      expect(events[0].metadata.tokenPrefix).toBe("invalid-");
    });

    it("should return 401 for token not found in database", async () => {
      const app = createTestApp();

      // Generate valid format token that doesn't exist in database
      const token = generateToken();

      // Track audit events
      const events: any[] = [];
      authEvents.on((event) => { events.push(event); });

      const response = await makeRequest(app, "GET", "/protected", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toBe("Invalid token");

      // Verify audit event was emitted
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("token.auth_failed");
      expect(events[0].metadata.reason).toBe("not_found");
    });

    it("should return 401 for revoked token", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create revoked token
      const token = generateToken();
      const keyHash = hashToken(token);
      const last4 = token.slice(-4);

      await prisma.apiKey.create({
        data: {
          userId: user.id,
          profileId: profile!.id,
          name: "Revoked Token",
          keyHash,
          last4,
          scopes: ["read:transactions"],
          revokedAt: new Date(),
        },
      });

      // Track audit events
      const events: any[] = [];
      authEvents.on((event) => { events.push(event); });

      const response = await makeRequest(app, "GET", "/protected", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toBe("Token revoked");

      // Verify audit event was emitted
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("token.auth_failed");
      expect(events[0].userId).toBe(user.id);
      expect(events[0].metadata.reason).toBe("revoked");
    });

    it("should return 401 for expired token", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create expired token
      const token = generateToken();
      const keyHash = hashToken(token);
      const last4 = token.slice(-4);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await prisma.apiKey.create({
        data: {
          userId: user.id,
          profileId: profile!.id,
          name: "Expired Token",
          keyHash,
          last4,
          scopes: ["read:transactions"],
          expiresAt: yesterday,
        },
      });

      // Track audit events
      const events: any[] = [];
      authEvents.on((event) => { events.push(event); });

      const response = await makeRequest(app, "GET", "/protected", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toBe("Token expired");

      // Verify audit event was emitted
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("token.auth_failed");
      expect(events[0].userId).toBe(user.id);
      expect(events[0].metadata.reason).toBe("expired");
    });
  });

  describe("Last Used Timestamp Update", () => {
    it("should update lastUsedAt timestamp on successful authentication", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

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

      // Verify lastUsedAt is initially null
      expect(apiKey.lastUsedAt).toBeNull();

      const response = await makeRequest(app, "GET", "/protected", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.status).toBe(200);

      // Wait a bit for async update to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify lastUsedAt was updated
      const updatedKey = await prisma.apiKey.findUnique({
        where: { id: apiKey.id },
      });

      expect(updatedKey!.lastUsedAt).not.toBeNull();
      expect(updatedKey!.lastUsedAt).toBeInstanceOf(Date);
    });

    it("should not block request if lastUsedAt update fails", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

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

      // Mock console.error to suppress error output
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const response = await makeRequest(app, "GET", "/protected", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Request should still succeed even if update fails
      expect(response.status).toBe(200);

      consoleErrorSpy.mockRestore();
    });
  });

  describe("User Context Attachment", () => {
    it("should attach all required context variables", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

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
          scopes: ["read:transactions", "write:budgets"],
        },
      });

      const response = await makeRequest(app, "GET", "/protected", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty("userId");
      expect(data).toHaveProperty("userEmail");
      expect(data).toHaveProperty("profileId");
      expect(data).toHaveProperty("authType");
      expect(data).toHaveProperty("tokenId");
      expect(data).toHaveProperty("tokenScopes");

      expect(data.userId).toBe(user.id);
      expect(data.userEmail).toBe(user.email);
      expect(data.profileId).toBe(profile!.id);
      expect(data.authType).toBe("pat");
      expect(data.tokenId).toBe(apiKey.id);
      expect(data.tokenScopes).toEqual(["read:transactions", "write:budgets"]);
    });

    it("should handle workspace-scoped tokens", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const workspace = await prisma.workspace.create({
        data: {
          ownerProfileId: profile!.id,
          name: "Workspace Token",
        },
      });

      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          memberProfileId: profile!.id,
          role: "owner",
        },
      });

      // Create token with workspaceId scope
      const token = generateToken();
      const keyHash = hashToken(token);
      const last4 = token.slice(-4);

      const apiKey = await prisma.apiKey.create({
        data: {
          userId: user.id,
          profileId: profile!.id,
          workspaceId: workspace.id,
          name: "Workspace Token",
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
      expect(data.userId).toBe(user.id);
      expect(data.profileId).toBe(profile!.id);
      expect(data.tokenId).toBe(apiKey.id);
    });
  });

  describe("Audit Event Emission", () => {
    it("should emit token.used event on successful authentication", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

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

      // Track audit events
      const events: any[] = [];
      authEvents.on((event) => { events.push(event); });

      const response = await makeRequest(app, "GET", "/protected", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.status).toBe(200);

      // Wait for async event emission
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify audit event was emitted
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("token.used");
      expect(events[0].userId).toBe(user.id);
      expect(events[0].metadata.tokenId).toBe(apiKey.id);
      expect(events[0].metadata.endpoint).toBe("/protected");
      expect(events[0].metadata.method).toBe("GET");
      expect(events[0].metadata.status).toBe(200);
    });

    it("should emit token.auth_failed event for all failure scenarios", async () => {
      const app = createTestApp();

      // Track audit events
      const events: any[] = [];
      authEvents.on((event) => { events.push(event); });

      // Test invalid format
      await makeRequest(app, "GET", "/protected", {
        headers: {
          Authorization: "Bearer invalid-format",
        },
      });

      // Test not found
      const validToken = generateToken();
      await makeRequest(app, "GET", "/protected", {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });

      // Verify both events were emitted
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("token.auth_failed");
      expect(events[0].metadata.reason).toBe("invalid_format");
      expect(events[1].type).toBe("token.auth_failed");
      expect(events[1].metadata.reason).toBe("not_found");
    });
  });

  describe("Error Handling", () => {
    it("should return 401 for any authentication error", async () => {
      const app = createTestApp();

      const response = await makeRequest(app, "GET", "/protected", {
        headers: {
          Authorization: "Bearer completely-invalid",
        },
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty("error");
    });

    it("should not leak error details in response", async () => {
      const app = createTestApp();

      const response = await makeRequest(app, "GET", "/protected", {
        headers: {
          Authorization: "Bearer invalid",
        },
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).not.toContain("stack");
      expect(data.error).not.toContain("prisma");
      expect(data.error).not.toContain("database");
    });

    it("should handle missing Authorization header gracefully", async () => {
      const app = createTestApp();

      const response = await makeRequest(app, "GET", "/protected");

      expect(response.status).toBe(401);
      expect(response.headers.get("content-type")).toContain(
        "application/json"
      );
    });
  });
});

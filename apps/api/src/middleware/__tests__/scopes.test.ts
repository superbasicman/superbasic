/**
 * Integration tests for scope enforcement middleware
 * Tests that PAT tokens are restricted by scopes while session auth has full access
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { requireScope } from "../scopes.js";
import { resetDatabase, getTestPrisma } from "../../test/setup.js";
import { makeRequest, createTestUser } from "../../test/helpers.js";
import { generateToken, hashToken, authEvents } from "@repo/auth";

// Define context variables type
type ScopeContext = {
  Variables: {
    userId: string;
    userEmail: string;
    profileId?: string;
    authType: "session" | "pat";
    tokenId?: string;
    tokenScopes?: string[];
  };
};

// Create a test app with scope middleware
// The mockAuth parameter allows tests to inject their own auth context
function createTestApp(
  mockAuth?: (c: Context) => void
) {
  const app = new Hono<ScopeContext>();

  // Mock auth middleware that sets context based on test needs
  if (mockAuth) {
    app.use("*", async (c, next) => {
      mockAuth(c);
      await next();
    });
  }

  // Endpoint requiring read:transactions scope
  app.get(
    "/transactions",
    requireScope("read:transactions"),
    async (c) => {
      return c.json({ message: "Success" });
    }
  );

  // Endpoint requiring write:transactions scope
  app.post(
    "/transactions",
    requireScope("write:transactions"),
    async (c) => {
      return c.json({ message: "Created" });
    }
  );

  // Endpoint requiring write:budgets scope
  app.post(
    "/budgets",
    requireScope("write:budgets"),
    async (c) => {
      return c.json({ message: "Created" });
    }
  );

  return app;
}

describe("Scope Enforcement Middleware", () => {
  let prisma: ReturnType<typeof getTestPrisma>;

  beforeEach(async () => {
    await resetDatabase();
    prisma = getTestPrisma();
    authEvents.clearHandlers();
  });

  afterEach(() => {
    authEvents.clearHandlers();
  });

  describe("Session Auth Bypass", () => {
    it("should allow session auth to access any endpoint", async () => {
      const { user } = await createTestUser();
      
      // Create app with session auth context
      const app = createTestApp((c) => {
        c.set("userId", user.id);
        c.set("userEmail", user.email);
        c.set("authType", "session");
      });

      // Session auth should access read endpoint
      const readResponse = await makeRequest(app, "GET", "/transactions");
      expect(readResponse.status).toBe(200);

      // Session auth should access write endpoint
      const writeResponse = await makeRequest(app, "POST", "/transactions");
      expect(writeResponse.status).toBe(200);

      // Session auth should access different resource
      const budgetResponse = await makeRequest(app, "POST", "/budgets");
      expect(budgetResponse.status).toBe(200);
    });

    it("should not check scopes for session auth", async () => {
      const { user } = await createTestUser();

      // Track audit events
      const events: any[] = [];
      authEvents.on((event) => events.push(event));

      // Create app with session auth context
      const app = createTestApp((c) => {
        c.set("userId", user.id);
        c.set("userEmail", user.email);
        c.set("authType", "session");
        // No tokenScopes set for session auth
      });

      const response = await makeRequest(app, "GET", "/transactions");
      expect(response.status).toBe(200);

      // No scope_denied events should be emitted
      const scopeDeniedEvents = events.filter(
        (e) => e.type === "token.scope_denied"
      );
      expect(scopeDeniedEvents).toHaveLength(0);
    });
  });

  describe("PAT Scope Enforcement", () => {
    it("should allow PAT with sufficient scope", async () => {
      const { user } = await createTestUser();

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

      // Create app with PAT auth context
      const app = createTestApp((c) => {
        c.set("userId", user.id);
        c.set("userEmail", user.email);
        c.set("authType", "pat");
        c.set("tokenId", apiKey.id);
        c.set("tokenScopes", ["read:transactions"]);
      });

      const response = await makeRequest(app, "GET", "/transactions");
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.message).toBe("Success");
    });

    it("should deny PAT with insufficient scope", async () => {
      const { user } = await createTestUser();

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
          scopes: ["read:transactions"], // Only read, not write
        },
      });

      // Track audit events
      const events: any[] = [];
      authEvents.on((event) => events.push(event));

      // Create app with PAT auth context
      const app = createTestApp((c) => {
        c.set("userId", user.id);
        c.set("userEmail", user.email);
        c.set("authType", "pat");
        c.set("tokenId", apiKey.id);
        c.set("tokenScopes", ["read:transactions"]);
      });

      const response = await makeRequest(app, "POST", "/transactions");
      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data.error).toBe("Insufficient permissions");
      expect(data.required).toBe("write:transactions");

      // Verify audit event was emitted
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("token.scope_denied");
      expect(events[0].userId).toBe(user.id);
      expect(events[0].metadata.tokenId).toBe(apiKey.id);
      expect(events[0].metadata.requiredScope).toBe("write:transactions");
      expect(events[0].metadata.providedScopes).toEqual(["read:transactions"]);
    });

    it("should deny PAT with wrong scope", async () => {
      const { user } = await createTestUser();

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
          scopes: ["read:budgets"], // Wrong resource
        },
      });

      // Create app with PAT auth context
      const app = createTestApp((c) => {
        c.set("userId", user.id);
        c.set("userEmail", user.email);
        c.set("authType", "pat");
        c.set("tokenId", apiKey.id);
        c.set("tokenScopes", ["read:budgets"]);
      });

      const response = await makeRequest(app, "GET", "/transactions");
      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data.error).toBe("Insufficient permissions");
      expect(data.required).toBe("read:transactions");
    });

    it("should allow PAT with multiple scopes", async () => {
      const { user } = await createTestUser();

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
          scopes: ["read:transactions", "write:transactions", "write:budgets"],
        },
      });

      // Create app with PAT auth context
      const app = createTestApp((c) => {
        c.set("userId", user.id);
        c.set("userEmail", user.email);
        c.set("authType", "pat");
        c.set("tokenId", apiKey.id);
        c.set("tokenScopes", [
          "read:transactions",
          "write:transactions",
          "write:budgets",
        ]);
      });

      // Should access read endpoint
      const readResponse = await makeRequest(app, "GET", "/transactions");
      expect(readResponse.status).toBe(200);

      // Should access write endpoint
      const writeResponse = await makeRequest(app, "POST", "/transactions");
      expect(writeResponse.status).toBe(200);

      // Should access different resource
      const budgetResponse = await makeRequest(app, "POST", "/budgets");
      expect(budgetResponse.status).toBe(200);
    });

    it("should deny PAT with empty scopes", async () => {
      const { user } = await createTestUser();

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
          scopes: [], // No scopes
        },
      });

      // Create app with PAT auth context
      const app = createTestApp((c) => {
        c.set("userId", user.id);
        c.set("userEmail", user.email);
        c.set("authType", "pat");
        c.set("tokenId", apiKey.id);
        c.set("tokenScopes", []);
      });

      const response = await makeRequest(app, "GET", "/transactions");
      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data.error).toBe("Insufficient permissions");
    });
  });

  describe("Audit Event Emission", () => {
    it("should emit scope_denied event with full context", async () => {
      const { user } = await createTestUser();

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
      authEvents.on((event) => events.push(event));

      // Create app with PAT auth context
      const app = createTestApp((c) => {
        c.set("userId", user.id);
        c.set("userEmail", user.email);
        c.set("authType", "pat");
        c.set("tokenId", apiKey.id);
        c.set("tokenScopes", ["read:transactions"]);
      });

      await makeRequest(app, "POST", "/transactions", {
        headers: {
          "User-Agent": "Test Client",
          "X-Forwarded-For": "192.168.1.1",
        },
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("token.scope_denied");
      expect(events[0].userId).toBe(user.id);
      expect(events[0].metadata).toMatchObject({
        tokenId: apiKey.id,
        endpoint: "/transactions",
        method: "POST",
        requiredScope: "write:transactions",
        providedScopes: ["read:transactions"],
        ip: "192.168.1.1",
        userAgent: "Test Client",
      });
    });

    it("should not emit events for successful scope checks", async () => {
      const { user } = await createTestUser();

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
      authEvents.on((event) => events.push(event));

      // Create app with PAT auth context
      const app = createTestApp((c) => {
        c.set("userId", user.id);
        c.set("userEmail", user.email);
        c.set("authType", "pat");
        c.set("tokenId", apiKey.id);
        c.set("tokenScopes", ["read:transactions"]);
      });

      await makeRequest(app, "GET", "/transactions");

      // No scope_denied events should be emitted
      const scopeDeniedEvents = events.filter(
        (e) => e.type === "token.scope_denied"
      );
      expect(scopeDeniedEvents).toHaveLength(0);
    });
  });

  describe("Error Handling", () => {
    it("should return 401 when authType is not set", async () => {
      // Create app without setting authType in context
      const app = createTestApp((c) => {
        c.set("userId", "user_123");
        c.set("userEmail", "test@example.com");
        // authType not set
      });

      const response = await makeRequest(app, "GET", "/transactions");
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("should handle missing tokenScopes gracefully", async () => {
      const { user } = await createTestUser();

      // Create app with PAT auth but no tokenScopes
      const app = createTestApp((c) => {
        c.set("userId", user.id);
        c.set("userEmail", user.email);
        c.set("authType", "pat");
        c.set("tokenId", "token_123");
        // tokenScopes not set
      });

      const response = await makeRequest(app, "GET", "/transactions");
      expect(response.status).toBe(403);
    });
  });
});

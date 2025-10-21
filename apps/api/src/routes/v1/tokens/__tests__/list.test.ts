/**
 * Integration tests for GET /v1/tokens - Token listing endpoint
 * Tests token retrieval, masking, sorting, and access control
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
  COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  JWT_SALT,
  authConfig,
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

// Helper to create API token directly in database
async function createApiToken(
  userId: string,
  profileId: string,
  options: {
    name: string;
    scopes: string[];
    expiresInDays?: number;
    lastUsedAt?: Date | null;
    revokedAt?: Date | null;
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
      lastUsedAt: options.lastUsedAt || null,
      revokedAt: options.revokedAt || null,
    },
  });

  return { apiKey, token };
}

describe("GET /v1/tokens - Token Listing", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe("Successful Token Listing", () => {
    it("should return empty array when user has no tokens", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);

      const response = await makeAuthenticatedRequest(
        app,
        "GET",
        "/v1/tokens",
        sessionToken
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty("tokens");
      expect(data.tokens).toEqual([]);
    });

    it("should return user's tokens with correct structure", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);
      const prisma = getTestPrisma();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create a token
      const { apiKey } = await createApiToken(user.id, profile!.id, {
        name: "Test Token",
        scopes: ["read:transactions"],
      });

      const response = await makeAuthenticatedRequest(
        app,
        "GET",
        "/v1/tokens",
        sessionToken
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.tokens).toHaveLength(1);

      const token = data.tokens[0];
      expect(token).toHaveProperty("id", apiKey.id);
      expect(token).toHaveProperty("name", "Test Token");
      expect(token).toHaveProperty("scopes");
      expect(token.scopes).toEqual(["read:transactions"]);
      expect(token).toHaveProperty("createdAt");
      expect(token).toHaveProperty("lastUsedAt", null);
      expect(token).toHaveProperty("expiresAt");
      expect(token).toHaveProperty("maskedToken");
      expect(token).not.toHaveProperty("token"); // No plaintext token
      expect(token).not.toHaveProperty("keyHash"); // No hash exposed
    });

    it("should mask token values correctly using last4", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);
      const prisma = getTestPrisma();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create a token
      const { apiKey, token: plaintextToken } = await createApiToken(
        user.id,
        profile!.id,
        {
          name: "Test Token",
          scopes: ["read:transactions"],
        }
      );

      const response = await makeAuthenticatedRequest(
        app,
        "GET",
        "/v1/tokens",
        sessionToken
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      const returnedToken = data.tokens[0];

      // Verify masked token format
      expect(returnedToken.maskedToken).toMatch(/^sbf_\*\*\*\*[A-Za-z0-9_-]{4}$/);
      expect(returnedToken.maskedToken).toBe(`sbf_****${apiKey.last4}`);
      expect(returnedToken.maskedToken.slice(-4)).toBe(plaintextToken.slice(-4));
    });

    it("should include lastUsedAt when token has been used", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);
      const prisma = getTestPrisma();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      const lastUsedAt = new Date("2025-01-15T10:30:00Z");

      // Create a token with lastUsedAt
      await createApiToken(user.id, profile!.id, {
        name: "Used Token",
        scopes: ["read:transactions"],
        lastUsedAt,
      });

      const response = await makeAuthenticatedRequest(
        app,
        "GET",
        "/v1/tokens",
        sessionToken
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      const token = data.tokens[0];

      expect(token.lastUsedAt).toBe(lastUsedAt.toISOString());
    });

    it("should return multiple tokens for user", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);
      const prisma = getTestPrisma();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create multiple tokens
      await createApiToken(user.id, profile!.id, {
        name: "Token 1",
        scopes: ["read:transactions"],
      });

      await createApiToken(user.id, profile!.id, {
        name: "Token 2",
        scopes: ["write:transactions"],
      });

      await createApiToken(user.id, profile!.id, {
        name: "Token 3",
        scopes: ["read:budgets", "write:budgets"],
      });

      const response = await makeAuthenticatedRequest(
        app,
        "GET",
        "/v1/tokens",
        sessionToken
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.tokens).toHaveLength(3);

      const names = data.tokens.map((t: any) => t.name);
      expect(names).toContain("Token 1");
      expect(names).toContain("Token 2");
      expect(names).toContain("Token 3");
    });
  });

  describe("Token Sorting", () => {
    it("should sort tokens by creation date (newest first)", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);
      const prisma = getTestPrisma();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create tokens with slight delays to ensure different timestamps
      const { apiKey: token1 } = await createApiToken(user.id, profile!.id, {
        name: "First Token",
        scopes: ["read:transactions"],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const { apiKey: token2 } = await createApiToken(user.id, profile!.id, {
        name: "Second Token",
        scopes: ["read:transactions"],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const { apiKey: token3 } = await createApiToken(user.id, profile!.id, {
        name: "Third Token",
        scopes: ["read:transactions"],
      });

      const response = await makeAuthenticatedRequest(
        app,
        "GET",
        "/v1/tokens",
        sessionToken
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.tokens).toHaveLength(3);

      // Verify newest first (reverse chronological order)
      expect(data.tokens[0].id).toBe(token3.id);
      expect(data.tokens[1].id).toBe(token2.id);
      expect(data.tokens[2].id).toBe(token1.id);

      // Verify timestamps are in descending order
      const timestamps = data.tokens.map((t: any) => new Date(t.createdAt).getTime());
      expect(timestamps[0]).toBeGreaterThanOrEqual(timestamps[1]);
      expect(timestamps[1]).toBeGreaterThanOrEqual(timestamps[2]);
    });
  });

  describe("Revoked Token Filtering", () => {
    it("should exclude revoked tokens from list", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);
      const prisma = getTestPrisma();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create active token
      await createApiToken(user.id, profile!.id, {
        name: "Active Token",
        scopes: ["read:transactions"],
      });

      // Create revoked token
      await createApiToken(user.id, profile!.id, {
        name: "Revoked Token",
        scopes: ["read:transactions"],
        revokedAt: new Date(),
      });

      const response = await makeAuthenticatedRequest(
        app,
        "GET",
        "/v1/tokens",
        sessionToken
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.tokens).toHaveLength(1);
      expect(data.tokens[0].name).toBe("Active Token");
    });

    it("should return empty array when all tokens are revoked", async () => {
      const { user } = await createTestUser();
      const app = createTestApp();
      const sessionToken = await createSessionToken(user.id, user.email);
      const prisma = getTestPrisma();

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });

      // Create only revoked tokens
      await createApiToken(user.id, profile!.id, {
        name: "Revoked Token 1",
        scopes: ["read:transactions"],
        revokedAt: new Date(),
      });

      await createApiToken(user.id, profile!.id, {
        name: "Revoked Token 2",
        scopes: ["read:transactions"],
        revokedAt: new Date(),
      });

      const response = await makeAuthenticatedRequest(
        app,
        "GET",
        "/v1/tokens",
        sessionToken
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.tokens).toEqual([]);
    });
  });

  describe("Access Control", () => {
    it("should only return tokens belonging to authenticated user", async () => {
      const { user: user1 } = await createTestUser();
      const { user: user2 } = await createTestUser();
      const app = createTestApp();
      const prisma = getTestPrisma();

      const profile1 = await prisma.profile.findUnique({
        where: { userId: user1.id },
      });

      const profile2 = await prisma.profile.findUnique({
        where: { userId: user2.id },
      });

      // Create tokens for both users
      await createApiToken(user1.id, profile1!.id, {
        name: "User 1 Token",
        scopes: ["read:transactions"],
      });

      await createApiToken(user2.id, profile2!.id, {
        name: "User 2 Token",
        scopes: ["read:transactions"],
      });

      // User 1 should only see their token
      const sessionToken1 = await createSessionToken(user1.id, user1.email);
      const response1 = await makeAuthenticatedRequest(
        app,
        "GET",
        "/v1/tokens",
        sessionToken1
      );

      expect(response1.status).toBe(200);

      const data1 = await response1.json();
      expect(data1.tokens).toHaveLength(1);
      expect(data1.tokens[0].name).toBe("User 1 Token");

      // User 2 should only see their token
      const sessionToken2 = await createSessionToken(user2.id, user2.email);
      const response2 = await makeAuthenticatedRequest(
        app,
        "GET",
        "/v1/tokens",
        sessionToken2
      );

      expect(response2.status).toBe(200);

      const data2 = await response2.json();
      expect(data2.tokens).toHaveLength(1);
      expect(data2.tokens[0].name).toBe("User 2 Token");
    });
  });

  describe("Authentication Requirements", () => {
    it("should require session authentication", async () => {
      const app = createTestApp();

      const response = await makeAuthenticatedRequest(
        app,
        "GET",
        "/v1/tokens",
        "" // No session token
      );

      expect(response.status).toBe(401);
    });

    it("should reject invalid session token", async () => {
      const app = createTestApp();

      const response = await makeAuthenticatedRequest(
        app,
        "GET",
        "/v1/tokens",
        "invalid-token"
      );

      expect(response.status).toBe(401);
    });
  });
});

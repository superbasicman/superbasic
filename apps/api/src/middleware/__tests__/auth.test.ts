/**
 * Integration tests for authentication middleware
 * Validates session cookie handling backed by the database.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
vi.unmock('@repo/database');
import { Hono } from "hono";
import { authMiddleware } from "../auth.js";
import { resetDatabase, getTestPrisma } from "../../test/setup.js";
import { prisma } from "@repo/database";
import {
  COOKIE_NAME,
  createOpaqueToken,
  createTokenHashEnvelope,
  SESSION_MAX_AGE_SECONDS,
  SESSION_ABSOLUTE_MAX_AGE_SECONDS,
} from "@repo/auth";
import {
  makeRequest,
  createTestUser,
  createSessionToken,
} from "../../test/helpers.js";

type AuthContext = {
  Variables: {
    userId: string;
    userEmail: string;
    jti: string;
  };
};

function createTestApp() {
  const app = new Hono<AuthContext>();

  app.get("/protected", authMiddleware, async (c) => {
    return c.json({
      userId: c.get("userId"),
      userEmail: c.get("userEmail"),
      jti: c.get("jti"),
    });
  });

  return app;
}

const getTokenId = (token: string) => token.split(".")[0] ?? "";

function ensureTokenHashKeys() {
  if (!process.env.TOKEN_HASH_KEYS) {
    const fallback =
      process.env.TOKEN_HASH_FALLBACK_SECRET ||
      process.env.AUTH_SECRET ||
      "test_token_hash_secret_for_vitest";
    process.env.TOKEN_HASH_KEYS = JSON.stringify({ v1: fallback });
    process.env.TOKEN_HASH_ACTIVE_KEY_ID ??= "v1";
  }
}

async function createSessionCookieForUser(userId: string) {
  ensureTokenHashKeys();
  const now = new Date();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const absoluteExpiresAt = new Date(
    now.getTime() + SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1000
  );
  const opaque = createOpaqueToken();

  await prisma.session.create({
    data: {
      userId,
      tokenId: opaque.tokenId,
      sessionTokenHash: createTokenHashEnvelope(opaque.tokenSecret),
      expiresAt,
      clientType: "web",
      kind: "default",
      lastUsedAt: now,
      absoluteExpiresAt,
    },
  });

  return opaque.value;
}

describe("Authentication Middleware", () => {
  let prisma: ReturnType<typeof getTestPrisma>;

  beforeEach(async () => {
    await resetDatabase();
    prisma = getTestPrisma();
  });

  it("authenticates requests with a valid session cookie", async () => {
    const { user } = await createTestUser();
    const testApp = createTestApp();

    const sessionCookie = await createSessionCookieForUser(user.id);

    const response = await makeRequest(testApp, "GET", "/protected", {
      cookies: {
        [COOKIE_NAME]: sessionCookie,
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.userId).toBe(user.id);
    expect(data.userEmail).toBe(user.email);
    expect(data.jti).toBe(getTokenId(sessionCookie));
  });

  it("returns 401 when the session cookie is missing", async () => {
    const app = createTestApp();
    const response = await makeRequest(app, "GET", "/protected");
    expect(response.status).toBe(401);
  });

  it("returns 401 for malformed session tokens", async () => {
    const { user } = await createTestUser();
    const app = createTestApp();

    await createSessionToken(user.id, user.email);

    const response = await makeRequest(app, "GET", "/protected", {
      cookies: {
        [COOKIE_NAME]: "not-a-valid-token",
      },
    });

    expect(response.status).toBe(401);
  });

  it("returns 401 when the session does not exist in the database", async () => {
    const { user } = await createTestUser();
    const app = createTestApp();
    const sessionToken = await createSessionToken(user.id, user.email);
    const tokenId = getTokenId(sessionToken);

    await prisma.session.deleteMany({ where: { tokenId } });

    const response = await makeRequest(app, "GET", "/protected", {
      cookies: {
        [COOKIE_NAME]: sessionToken,
      },
    });

    expect(response.status).toBe(401);
  });

  it("returns 401 when the session token secret is tampered with", async () => {
    const { user } = await createTestUser();
    const app = createTestApp();
    const sessionToken = await createSessionToken(user.id, user.email);
    const tokenId = getTokenId(sessionToken);
    const tamperedToken = `${tokenId}.invalid-secret`;

    const response = await makeRequest(app, "GET", "/protected", {
      cookies: {
        [COOKIE_NAME]: tamperedToken,
      },
    });

    expect(response.status).toBe(401);
  });

  it("returns 401 for expired sessions", async () => {
    const { user } = await createTestUser();
    const app = createTestApp();
    const expiredToken = await createSessionToken(user.id, user.email, {
      expiresInSeconds: -3600,
    });

    const response = await makeRequest(app, "GET", "/protected", {
      cookies: {
        [COOKIE_NAME]: expiredToken,
      },
    });

    expect(response.status).toBe(401);
  });
});

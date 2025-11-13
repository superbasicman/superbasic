/**
 * Integration tests for authentication middleware
 * Validates session cookie handling backed by the database.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "../auth.js";
import { resetDatabase, getTestPrisma } from "../../test/setup.js";
import {
  makeRequest,
  createTestUser,
  createSessionToken,
} from "../../test/helpers.js";
import { COOKIE_NAME } from "@repo/auth";

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

describe("Authentication Middleware", () => {
  let prisma: ReturnType<typeof getTestPrisma>;

  beforeEach(async () => {
    await resetDatabase();
    prisma = getTestPrisma();
  });

  it("authenticates requests with a valid session cookie", async () => {
    const { user } = await createTestUser();
    const app = createTestApp();

    const sessionToken = await createSessionToken(user.id, user.email);

    const response = await makeRequest(app, "GET", "/protected", {
      cookies: {
        [COOKIE_NAME]: sessionToken,
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.userId).toBe(user.id);
    expect(data.userEmail).toBe(user.email);
    expect(data.jti).toBe(getTokenId(sessionToken));
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

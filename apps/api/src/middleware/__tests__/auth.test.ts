import { describe, it, expect, beforeEach, vi } from "vitest";

vi.unmock('@repo/database');

import { Hono } from "hono";
import { authMiddleware } from "../auth.js";
import { attachAuthContext } from "../auth-context.js";
import { resetDatabase } from "../../test/setup.js";
import {
  createTestUser,
  createAccessToken,
  makeAuthenticatedRequest,
  makeRequest,
} from "../../test/helpers.js";
import type { AppBindings } from "../../types/context.js";

function createTestApp() {
  const app = new Hono<AppBindings>();
  app.use("*", attachAuthContext);
  app.get("/protected", authMiddleware, async (c) => {
    return c.json({
      userId: c.get("userId"),
      profileId: c.get("profileId") ?? null,
      authType: c.get("authType"),
    });
  });
  return app;
}

describe("Authentication Middleware", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("authenticates requests with a valid access token", async () => {
    const { user } = await createTestUser();
    const { token } = await createAccessToken(user.id);
    const app = createTestApp();

    const response = await makeAuthenticatedRequest(app, "GET", "/protected", token);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.userId).toBe(user.id);
    expect(data.authType).toBe("session");
  });

  it("returns 401 when Authorization header is missing", async () => {
    const app = createTestApp();
    const response = await makeRequest(app, "GET", "/protected");
    expect(response.status).toBe(401);
  });

  it("returns 401 for malformed tokens", async () => {
    const app = createTestApp();
    const response = await makeRequest(app, "GET", "/protected", {
      headers: { Authorization: "Bearer not-a-token" },
    });
    expect(response.status).toBe(401);
  });

  it("returns 401 when the backing session is expired", async () => {
    const { user } = await createTestUser();
    const { token } = await createAccessToken(user.id, { expiresInSeconds: -3600 });
    const app = createTestApp();

    const response = await makeAuthenticatedRequest(app, "GET", "/protected", token);
    expect(response.status).toBe(401);
  });
});

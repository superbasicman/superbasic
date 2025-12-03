import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { prisma as sharedPrisma } from "@repo/database";
import { patMiddleware } from "../pat.js";
import { resetDatabase, getTestPrisma } from "../../test/setup.js";
import { makeRequest, createPersonalAccessToken, createTestUser } from "../../test/helpers.js";

type PatContext = {
  Variables: {
    userId: string;
    userEmail: string;
    profileId: string;
    authType: "pat";
    tokenId?: string;
    tokenScopes: string[];
  };
};

function createTestApp() {
  const app = new Hono<PatContext>();

  app.get("/protected", patMiddleware, async (c) => {
    return c.json({
      userId: c.get("userId"),
      userEmail: c.get("userEmail"),
      profileId: c.get("profileId"),
      workspaceId: c.get("workspaceId"),
      authType: c.get("authType"),
      tokenId: c.get("tokenId"),
      tokenScopes: c.get("tokenScopes"),
    });
  });

  return app;
}

describe("PAT middleware (auth-core)", () => {
  let prisma: typeof sharedPrisma;

  beforeEach(async () => {
    await resetDatabase();
    prisma = getTestPrisma();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("authenticates a PAT and attaches context", async () => {
    const { user } = await createTestUser();
    const app = createTestApp();

    const pat = await createPersonalAccessToken({
      userId: user.id,
      email: user.primaryEmail,
      profileId: user.profile.id,
      scopes: ["read:transactions"],
    });

    const response = await makeRequest(app, "GET", "/protected", {
      headers: { Authorization: `Bearer ${pat.token}` },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.userId).toBe(user.id);
    expect(data.userEmail).toBe(user.primaryEmail);
    expect(data.authType).toBe("pat");
    expect(data.tokenId).toBe(pat.tokenId);
    expect(data.tokenScopes).toEqual(["read:transactions"]);
  });

  it("enforces revoked tokens", async () => {
    const { user } = await createTestUser();
    const app = createTestApp();

    const pat = await createPersonalAccessToken({
      userId: user.id,
      email: user.primaryEmail,
      profileId: user.profile.id,
      scopes: ["read:transactions"],
      revokedAt: new Date(),
    });

    const response = await makeRequest(app, "GET", "/protected", {
      headers: { Authorization: `Bearer ${pat.token}` },
    });

    expect(response.status).toBe(401);
  });

  it("enforces expiration", async () => {
    const { user } = await createTestUser();
    const app = createTestApp();

    const pat = await createPersonalAccessToken({
      userId: user.id,
      email: user.primaryEmail,
      profileId: user.profile.id,
      scopes: ["read:transactions"],
      expiresAt: new Date(Date.now() - 1000),
    });

    const response = await makeRequest(app, "GET", "/protected", {
      headers: { Authorization: `Bearer ${pat.token}` },
    });

    expect(response.status).toBe(401);
  });

  it("accepts workspace-scoped tokens when membership exists", async () => {
    const { user } = await createTestUser();
    const app = createTestApp();

  const workspace = await prisma.workspace.create({
    data: {
      ownerUserId: user.id,
      name: "Workspace Token",
      slug: `workspace-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    },
  });
  await prisma.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      role: "owner",
    },
  });

    const pat = await createPersonalAccessToken({
      userId: user.id,
      email: user.primaryEmail,
      profileId: user.profile.id,
      scopes: ["read:transactions"],
      workspaceId: workspace.id,
    });

    const response = await makeRequest(app, "GET", "/protected", {
      headers: { Authorization: `Bearer ${pat.token}` },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.workspaceId).toBe(workspace.id);
  });

  it("returns 401 for missing Authorization header", async () => {
    const app = createTestApp();
    const response = await makeRequest(app, "GET", "/protected");
    expect(response.status).toBe(401);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { Prisma, prisma as sharedPrisma } from "@repo/database";
import { createOpaqueToken, createTokenHashEnvelope } from "@repo/auth";
import { patMiddleware } from "../pat.js";
import { resetDatabase, getTestPrisma } from "../../test/setup.js";
import { makeRequest, createTestUser } from "../../test/helpers.js";

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

function ensureTokenHashEnv() {
  if (!process.env.TOKEN_HASH_KEYS) {
    const fallback =
      process.env.TOKEN_HASH_FALLBACK_SECRET ||
      process.env.AUTH_SECRET ||
      "test_token_hash_secret_for_vitest";
    process.env.TOKEN_HASH_KEYS = JSON.stringify({ v1: fallback });
    process.env.TOKEN_HASH_ACTIVE_KEY_ID = "v1";
  }
}

async function createPatToken(opts: {
  userId: string;
  scopes: string[];
  workspaceId?: string | null;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
}) {
  ensureTokenHashEnv();
  const prisma = getTestPrisma();
  const opaque = createOpaqueToken();
  const tokenHash = createTokenHashEnvelope(opaque.tokenSecret);

  await prisma.token.create({
    data: {
      id: opaque.tokenId,
      userId: opts.userId,
      sessionId: null,
      workspaceId: opts.workspaceId ?? null,
      type: "personal_access",
      tokenHash,
      scopes: opts.scopes,
      name: "Test PAT",
      familyId: null,
      metadata: Prisma.DbNull,
      lastUsedAt: null,
      expiresAt: opts.expiresAt ?? null,
      revokedAt: opts.revokedAt ?? null,
    },
  });

  return { token: opaque.value, tokenId: opaque.tokenId };
}

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

    const pat = await createPatToken({
      userId: user.id,
      scopes: ["read:transactions"],
    });

    const response = await makeRequest(app, "GET", "/protected", {
      headers: { Authorization: `Bearer ${pat.token}` },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.userId).toBe(user.id);
    expect(data.userEmail).toBe(user.email);
    expect(data.authType).toBe("pat");
    expect(data.tokenId).toBe(pat.tokenId);
    expect(data.tokenScopes).toEqual(["read:transactions"]);
  });

  it("enforces revoked tokens", async () => {
    const { user } = await createTestUser();
    const app = createTestApp();

    const pat = await createPatToken({
      userId: user.id,
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

    const pat = await createPatToken({
      userId: user.id,
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

    const profile = await prisma.profile.findFirst({ where: { userId: user.id } });
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

    const pat = await createPatToken({
      userId: user.id,
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

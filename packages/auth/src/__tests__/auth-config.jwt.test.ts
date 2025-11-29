import { randomUUID } from "node:crypto";
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

type SessionRecord = {
  id: string;
  userId: string;
  expiresAt: Date;
  absoluteExpiresAt: Date | null;
  revokedAt: Date | null;
  sessionTokenHash: unknown;
};

type UserRecord = {
  id: string;
  email: string;
  status: "active" | "disabled";
};

let sessionStore = new Map<string, SessionRecord>();
let userStore = new Map<string, UserRecord>();

vi.mock("@repo/database", () => {
  return {
    prisma: {
      session: {
        create: vi.fn(async ({ data }) => {
          const record: SessionRecord = {
            id: randomUUID(),
            userId: data.userId,
            expiresAt: data.expiresAt,
            absoluteExpiresAt: data.absoluteExpiresAt ?? null,
            revokedAt: null,
            sessionTokenHash: data.sessionTokenHash,
          };
          sessionStore.set(record.id, record);
          return record;
        }),
        findUnique: vi.fn(async ({ where }) => {
          const record =
            sessionStore.get(where.id) ??
            Array.from(sessionStore.values()).find((s) => s.id === where.id) ??
            null;
          if (!record) {
            return null;
          }
          const user = userStore.get(record.userId);
          return user
            ? {
                ...record,
                user,
              }
            : null;
        }),
        delete: vi.fn(async ({ where }) => {
          const record = sessionStore.get(where.id);
          if (!record) {
            throw new Error("Not found");
          }
          sessionStore.delete(where.id);
          return record;
        }),
      },
      user: {
        findUnique: vi.fn(async ({ where }) => userStore.get(where.id) ?? null),
      },
    },
  };
});

const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIBZLZTa3YL6hFLaeL7MIcAvPPnlPN002Skk1Q0YOq6T0
-----END PRIVATE KEY-----`;

async function loadConfig() {
  const mod = await import("../config.js");
  return mod.authConfig;
}

describe("Auth.js config JWT alignment", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    sessionStore = new Map();
    userStore = new Map();
    userStore.set("user-1", { id: "user-1", email: "user@example.com", status: "active" });

    process.env.AUTH_SECRET = "test-secret-should-be-long-enough-for-auth-js";
    process.env.AUTH_JWT_ISSUER = "http://localhost:3000";
    process.env.AUTH_JWT_AUDIENCE = "http://localhost:3000/v1";
    process.env.AUTH_JWT_ALGORITHM = "EdDSA";
    process.env.AUTH_JWT_KEY_ID = "test-key";
    process.env.AUTH_JWT_PRIVATE_KEY = TEST_PRIVATE_KEY;
  });

  afterEach(() => {
    delete process.env.AUTH_SECRET;
    delete process.env.AUTH_JWT_ISSUER;
    delete process.env.AUTH_JWT_AUDIENCE;
    delete process.env.AUTH_JWT_ALGORITHM;
    delete process.env.AUTH_JWT_KEY_ID;
    delete process.env.AUTH_JWT_PRIVATE_KEY;
  });

  test("issues and decodes AuthCore-style access tokens with sub/sid", async () => {
    const authConfig = await loadConfig();

    const jwtPayload = await authConfig.callbacks.jwt({
      token: {},
      user: { id: "user-1", email: "user@example.com" },
    });

    expect(jwtPayload.accessToken).toBeDefined();
    expect(jwtPayload.sessionId).toBeDefined();

    const encoded = await authConfig.jwt.encode({ token: jwtPayload } as any);
    expect(encoded).toBe(jwtPayload.accessToken);

    const decoded = await authConfig.jwt.decode({ token: encoded } as any);
    expect(decoded?.sub).toBe("user-1");
    expect(decoded?.sid).toBe(jwtPayload.sessionId);
    expect(decoded?.token_use).toBe("access");
  });

  test("returns null when the session is revoked", async () => {
    const authConfig = await loadConfig();

    const jwtPayload = await authConfig.callbacks.jwt({
      token: {},
      user: { id: "user-1", email: "user@example.com" },
    });

    const session = sessionStore.get(jwtPayload.sessionId);
    expect(session).toBeDefined();
    if (session) {
      session.revokedAt = new Date();
    }

    const decoded = await authConfig.jwt.decode({ token: jwtPayload.accessToken } as any);
    expect(decoded).toBeNull();
  });
});

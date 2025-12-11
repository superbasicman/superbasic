/// <reference types="vitest" />

import { afterEach, vi } from 'vitest';
import crypto from 'node:crypto';

/**
 * Vitest setup file
 * Runs before each test file
 *
 * Note: Auth error logs are suppressed in vitest.config.ts via onConsoleLog
 * to keep CI output clean. Expected errors like CredentialsSignin, MissingCSRF,
 * and CallbackRouteError are intentional test cases and don't indicate failures.
 */

// Mock rate limiting to avoid Redis connection issues in tests
vi.mock('@repo/rate-limit', async () => {
  const actual = await vi.importActual<typeof import('@repo/rate-limit')>('@repo/rate-limit');

  return {
    ...actual,
    checkLimit: vi.fn().mockResolvedValue({ success: true }),
    Redis: class MockRedis {
      constructor() {}
      get() {
        return Promise.resolve(null);
      }
      set() {
        return Promise.resolve('OK');
      }
      incr() {
        return Promise.resolve(1);
      }
      expire() {
        return Promise.resolve(1);
      }
      del() {
        return Promise.resolve(1);
      }
      zremrangebyscore() {
        return Promise.resolve(0);
      }
      zadd() {
        return Promise.resolve(1);
      }
      zcard() {
        return Promise.resolve(0);
      }
      zrange() {
        return Promise.resolve([]);
      }
    },
  };
});

// Allow tests to opt-in to the Prisma mock by setting VITEST_MOCK_DATABASE=true
const shouldMockDatabase = vi.hoisted(() => {
  const flag = process.env.VITEST_MOCK_DATABASE;
  if (!flag) {
    return false;
  }

  const normalized = flag.toLowerCase();
  return normalized !== 'false' && normalized !== '0' && normalized !== 'off';
});

if (shouldMockDatabase) {
  const usersStore = vi.hoisted(() => new Map<string, any>());
  const profilesStore = vi.hoisted(() => new Map<string, any>());
  const tokensStore = vi.hoisted(() => new Map<string, any>());
  const workspacesStore = vi.hoisted(() => new Map<string, any>());
  const workspaceMembersStore = vi.hoisted(() => new Map<string, any>());

  // Mock Prisma Client for unit tests that don't need database
  // This prevents Prisma initialization errors when routes are imported during test collection
  vi.mock('@repo/database', async () => {
    const actual = await vi.importActual<typeof import('@repo/database')>('@repo/database');
    const uuid = () => crypto.randomUUID();
    const findUser = (where: any) => {
      const users = usersStore;
      if (!where) return null;
      if (where.id && users.has(where.id)) return users.get(where.id);
      if (where.email) {
        return [...users.values()].find((u) => u.email === where.email) ?? null;
      }
      return null;
    };
    const findProfile = (where: any) => {
      const profiles = profilesStore;
      if (!where) return null;
      if (where.id && profiles.has(where.id)) return profiles.get(where.id);
      if (where.userId) {
        return [...profiles.values()].find((p) => p.userId === where.userId) ?? null;
      }
      return null;
    };

    return {
      // Mock the singleton prisma instance for unit tests
      prisma: {
        $connect: vi.fn(),
        $disconnect: vi.fn(),
        $executeRawUnsafe: vi.fn(),
        token: {
          create: vi.fn(async ({ data }) => {
            const record = {
              ...data,
              id: data.id ?? uuid(),
              type: data.type ?? 'personal_access',
              user: findUser({ id: data.userId }) ?? {
                id: data.userId,
                status: 'active',
                profile: findProfile({ userId: data.userId }) ?? { id: null },
              },
            };
            tokensStore.set(record.id, record);
            return record;
          }),
          findUnique: vi.fn(async ({ where }) => {
            const record = tokensStore.get(where.id);
            if (!record) return null;
            const user = findUser({ id: record.userId }) ?? {
              id: record.userId,
              status: 'active',
              profile: findProfile({ userId: record.userId }) ?? { id: null },
            };
            return { ...record, user };
          }),
          update: vi.fn(async ({ where, data }) => {
            const existing = tokensStore.get(where.id);
            if (!existing) {
              return null;
            }
            const updated = { ...existing, ...data };
            tokensStore.set(where.id, updated);
            return updated;
          }),
        },
        user: {
          findUnique: vi.fn(async ({ where }) => findUser(where)),
          findMany: vi.fn(async () => [...usersStore.values()]),
          create: vi.fn(async ({ data }) => {
            const id = data.id ?? uuid();
            const record = { ...data, id, status: data.status ?? 'active' };
            usersStore.set(id, record);
            return record;
          }),
          update: vi.fn(async ({ where, data }) => {
            const existing = findUser(where);
            if (!existing) return null;
            const updated = { ...existing, ...data };
            usersStore.set(updated.id, updated);
            return updated;
          }),
          delete: vi.fn(async ({ where }) => {
            const existing = findUser(where);
            if (existing) {
              usersStore.delete(existing.id);
            }
            return existing;
          }),
        },
        profile: {
          findUnique: vi.fn(async ({ where }) => findProfile(where)),
          findMany: vi.fn(async () => [...profilesStore.values()]),
          create: vi.fn(async ({ data }) => {
            const id = data.id ?? uuid();
            const record = { ...data, id };
            profilesStore.set(id, record);
            const user = usersStore.get(data.userId);
            if (user) {
              usersStore.set(user.id, { ...user, profile: { id } });
            }
            return record;
          }),
          update: vi.fn(async ({ where, data }) => {
            const existing = findProfile(where);
            if (!existing) return null;
            const updated = { ...existing, ...data };
            profilesStore.set(updated.id, updated);
            return updated;
          }),
          delete: vi.fn(async ({ where }) => {
            const existing = findProfile(where);
            if (existing) {
              profilesStore.delete(existing.id);
            }
            return existing;
          }),
        },
        apiKey: {
          findUnique: vi.fn(),
          findMany: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          deleteMany: vi.fn(),
        },
        workspace: {
          create: vi.fn(async ({ data }) => {
            const id = data.id ?? uuid();
            const record = { ...data, id, deletedAt: null };
            workspacesStore.set(id, record);
            return record;
          }),
        },
        workspaceMember: {
          findFirst: vi.fn(async ({ where }) => {
            return (
              [...workspaceMembersStore.values()].find((m) => {
                const profileMatch = m.memberProfileId === where?.memberProfileId;
                const workspaceId =
                  typeof where?.workspaceId === 'string'
                    ? where.workspaceId
                    : ((where?.workspaceId as any)?.equals ?? null);
                const workspaceMatch = workspaceId ? m.workspaceId === workspaceId : true;
                return profileMatch && workspaceMatch;
              }) ?? null
            );
          }),
          create: vi.fn(async ({ data }) => {
            const id = data.id ?? uuid();
            const record = { ...data, id };
            workspaceMembersStore.set(id, record);
            return record;
          }),
        },
      },
      // Use the REAL PrismaClient constructor for integration tests
      // Integration tests create new instances with configuration
      PrismaClient: actual.PrismaClient,
      Prisma: actual.Prisma,
      setPostgresContext: actual.setPostgresContext,
    };
  });

  afterEach(() => {
    usersStore.clear();
    profilesStore.clear();
    tokensStore.clear();
    workspacesStore.clear();
    workspaceMembersStore.clear();
  });
}

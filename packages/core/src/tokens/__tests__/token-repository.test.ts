/**
 * Token Repository Integration Tests
 * 
 * Tests repository methods with real test database
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@repo/database";
import { TokenRepository } from "../token-repository.js";
import type { User, Profile } from "@repo/database";
import { hashToken } from "@repo/auth";

describe("TokenRepository", () => {
  let tokenRepo: TokenRepository;
  let testUser!: User;
  let testProfile!: Profile;

  beforeEach(async () => {
    tokenRepo = new TokenRepository(prisma);

    // Create test user with profile
    try {
      const email = `test-${randomUUID()}@example.com`;
      const created = await prisma.user.create({
        data: {
          email,
          emailLower: email.toLowerCase(),
          password: "hashed_password",
          profile: {
            create: {
              timezone: "UTC",
              currency: "USD",
            },
          },
        },
        include: {
          profile: true,
        },
      });
      testUser = created;
      if (!created.profile) {
        throw new Error("TokenRepository tests require profile creation");
      }
      testProfile = created.profile;
    } catch (error) {
      console.error("TokenRepository setup failed. Ensure test database is reachable.", error);
      throw error;
    }
  });

  afterEach(async () => {
    // Cleanup: delete all tokens for test user
    const userId = testUser?.id;
    if (userId) {
      await prisma.apiKey.deleteMany({
        where: { userId },
      });
    }

    // Delete test profile (cascades to user)
    const profileId = testProfile?.id;
    if (profileId) {
      await prisma.profile.deleteMany({
        where: { id: profileId },
      });
    }

    // Delete test user
    if (userId) {
      await prisma.user.deleteMany({
        where: { id: userId },
      });
    }
  });

  describe("existsByUserAndName", () => {
    it("should return false if token does not exist", async () => {
      const exists = await tokenRepo.existsByUserAndName(
        testUser.id,
        "Nonexistent Token"
      );
      expect(exists).toBe(false);
    });

    it("should return true if active token exists", async () => {
      // Create token
      await tokenRepo.create({
        userId: testUser.id,
        profileId: testProfile.id,
        name: "Existing Token",
        keyHash: hashToken("existing-token"),
        last4: "abcd",
        scopes: ["read:profile"],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      });

      const exists = await tokenRepo.existsByUserAndName(
        testUser.id,
        "Existing Token"
      );
      expect(exists).toBe(true);
    });

    it("should return false if token is revoked", async () => {
      // Create and revoke token
      const revokedKey = hashToken("revoked-token");
      const token = await tokenRepo.create({
        userId: testUser.id,
        profileId: testProfile.id,
        name: "Revoked Token",
        keyHash: revokedKey,
        last4: "xyz",
        scopes: ["read:profile"],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      await tokenRepo.revoke(token.id);

      const exists = await tokenRepo.existsByUserAndName(
        testUser.id,
        "Revoked Token"
      );
      expect(exists).toBe(false);
    });
  });

  describe("create", () => {
    it("should create token successfully", async () => {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const tokenHash = hashToken("create-token");
      const token = await tokenRepo.create({
        userId: testUser.id,
        profileId: testProfile.id,
        name: "Test Token",
        keyHash: tokenHash,
        last4: "test",
        scopes: ["read:profile", "write:profile"],
        expiresAt,
      });

      expect(token.id).toBeDefined();
      expect(token.userId).toBe(testUser.id);
      expect(token.profileId).toBe(testProfile.id);
      expect(token.name).toBe("Test Token");
      expect((token.keyHash as any).hash).toBe(tokenHash.hash);
      expect(token.last4).toBe("test");
      expect(token.scopes).toEqual(["read:profile", "write:profile"]);
      expect(token.expiresAt?.getTime()).toBe(expiresAt.getTime());
      expect(token.revokedAt).toBeNull();
      expect(token.lastUsedAt).toBeNull();
      expect(token.createdAt).toBeInstanceOf(Date);
      expect(token.updatedAt).toBeInstanceOf(Date);
    });

    it("should create token with profileId", async () => {
      const hash = hashToken("profile-token");
      const token = await tokenRepo.create({
        userId: testUser.id,
        profileId: testProfile.id,
        name: "Profile Token",
        keyHash: hash,
        last4: "prof",
        scopes: ["read:transactions"],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      expect(token.profileId).toBe(testProfile.id);
    });
  });

  describe("findById", () => {
    it("should return null if token not found", async () => {
      const token = await tokenRepo.findById(randomUUID());
      expect(token).toBeNull();
    });

    it("should return token if found", async () => {
      const findHash = hashToken("hash_find");
      const created = await tokenRepo.create({
        userId: testUser.id,
        profileId: testProfile.id,
        name: "Find Me",
        keyHash: findHash,
        last4: "find",
        scopes: ["read:budgets"],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const found = await tokenRepo.findById(created.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe("Find Me");
    });

    it("should return revoked token", async () => {
      const revokedFindHash = hashToken("hash_revoked_find");
      const created = await tokenRepo.create({
        userId: testUser.id,
        profileId: testProfile.id,
        name: "Revoked Find",
        keyHash: revokedFindHash,
        last4: "revf",
        scopes: ["read:accounts"],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      await tokenRepo.revoke(created.id);

      const found = await tokenRepo.findById(created.id);
      expect(found).not.toBeNull();
      expect(found?.revokedAt).toBeInstanceOf(Date);
    });
  });

  describe("findActiveByUserId", () => {
    it("should return empty array if no tokens", async () => {
      const tokens = await tokenRepo.findActiveByUserId(testUser.id);
      expect(tokens).toEqual([]);
    });

    it("should return all active tokens for user", async () => {
      // Create multiple tokens
      await tokenRepo.create({
        userId: testUser.id,
        profileId: testProfile.id,
        name: "Token 1",
        keyHash: hashToken("hash1"),
        last4: "tok1",
        scopes: ["read:profile"],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      await tokenRepo.create({
        userId: testUser.id,
        profileId: testProfile.id,
        name: "Token 2",
        keyHash: hashToken("hash2"),
        last4: "tok2",
        scopes: ["write:budgets"],
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      });

      const tokens = await tokenRepo.findActiveByUserId(testUser.id);
      expect(tokens).toHaveLength(2);
      expect(tokens[0].name).toBe("Token 2"); // Newest first
      expect(tokens[1].name).toBe("Token 1");
    });

    it("should exclude revoked tokens", async () => {
      // Create active token
      const activeHash = hashToken("hash_active");
      await tokenRepo.create({
        userId: testUser.id,
        profileId: testProfile.id,
        name: "Active Token",
        keyHash: activeHash,
        last4: "actv",
        scopes: ["read:profile"],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      // Create and revoke token
      const revoked = await tokenRepo.create({
        userId: testUser.id,
        profileId: testProfile.id,
        name: "Revoked Token",
        keyHash: hashToken("hash_revoked"),
        last4: "revk",
        scopes: ["read:profile"],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      await tokenRepo.revoke(revoked.id);

      const tokens = await tokenRepo.findActiveByUserId(testUser.id);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].name).toBe("Active Token");
    });

    it("should return tokens sorted by creation date (newest first)", async () => {
      // Create tokens with slight delay to ensure different timestamps
      const token1 = await tokenRepo.create({
        userId: testUser.id,
        profileId: testProfile.id,
        name: "First Token",
        keyHash: hashToken("hash_first"),
        last4: "fst",
        scopes: ["read:profile"],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      // Small delay to ensure different createdAt
      await new Promise((resolve) => setTimeout(resolve, 10));

      const token2 = await tokenRepo.create({
        userId: testUser.id,
        profileId: testProfile.id,
        name: "Second Token",
        keyHash: hashToken("hash_second"),
        last4: "snd",
        scopes: ["read:profile"],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const tokens = await tokenRepo.findActiveByUserId(testUser.id);
      expect(tokens).toHaveLength(2);
      expect(tokens[0].id).toBe(token2.id); // Newest first
      expect(tokens[1].id).toBe(token1.id);
    });
  });

  describe("update", () => {
    it("should update token name", async () => {
      const updateHash = hashToken("hash_update");
      const token = await tokenRepo.create({
        userId: testUser.id,
        profileId: testProfile.id,
        name: "Old Name",
        keyHash: updateHash,
        last4: "updt",
        scopes: ["read:profile"],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const updated = await tokenRepo.update(token.id, { name: "New Name" });
      expect(updated.name).toBe("New Name");
      expect(updated.id).toBe(token.id);
      expect((updated.keyHash as any).hash).toBe(updateHash.hash); // Unchanged
      expect(updated.scopes).toEqual(["read:profile"]); // Unchanged
    });
  });

  describe("revoke", () => {
    it("should set revokedAt timestamp", async () => {
      const revokeHash = hashToken("hash_to_revoke");
      const token = await tokenRepo.create({
        userId: testUser.id,
        profileId: testProfile.id,
        name: "To Revoke",
        keyHash: revokeHash,
        last4: "trvk",
        scopes: ["read:profile"],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      expect(token.revokedAt).toBeNull();

      await tokenRepo.revoke(token.id);

      const revoked = await tokenRepo.findById(token.id);
      expect(revoked?.revokedAt).toBeInstanceOf(Date);
      expect(revoked?.revokedAt?.getTime()).toBeGreaterThan(
        token.createdAt.getTime()
      );
    });

    it("should be idempotent (can revoke already revoked token)", async () => {
      const doubleRevokeHash = hashToken("hash_double_revoke");
      const token = await tokenRepo.create({
        userId: testUser.id,
        profileId: testProfile.id,
        name: "Double Revoke",
        keyHash: doubleRevokeHash,
        last4: "drvk",
        scopes: ["read:profile"],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      // First revocation
      await tokenRepo.revoke(token.id);
      const firstRevoke = await tokenRepo.findById(token.id);
      const firstRevokedAt = firstRevoke?.revokedAt;

      // Second revocation (should update timestamp)
      await new Promise((resolve) => setTimeout(resolve, 10));
      await tokenRepo.revoke(token.id);
      const secondRevoke = await tokenRepo.findById(token.id);

      expect(secondRevoke?.revokedAt).toBeInstanceOf(Date);
      // Timestamp should be updated
      expect(secondRevoke?.revokedAt?.getTime()).toBeGreaterThanOrEqual(
        firstRevokedAt?.getTime() || 0
      );
    });
  });
});

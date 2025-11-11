/**
 * Profile Repository Integration Tests
 * 
 * Tests repository methods with real test database
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@repo/database";
import { ProfileRepository } from "../profile-repository.js";
import type { User, Profile } from "@repo/database";

describe("ProfileRepository", () => {
  let profileRepo: ProfileRepository;
  let testUser: User;
  let testProfile: Profile | null;

  beforeEach(async () => {
    profileRepo = new ProfileRepository(prisma);

    // Create test user without profile initially
    const email = `test-${Date.now()}@example.com`;
    testUser = await prisma.user.create({
      data: {
        email,
        emailLower: email.toLowerCase(),
        password: "hashed_password",
      },
    });

    testProfile = null;
  });

  afterEach(async () => {
    // Cleanup: delete test profile if exists
    if (testProfile) {
      await prisma.profile.delete({
        where: { id: testProfile.id },
      }).catch(() => {
        // Profile might already be deleted
      });
    }

    // Delete test user
    await prisma.user.delete({
      where: { id: testUser.id },
    }).catch(() => {
      // User might already be deleted
    });
  });

  describe("findByUserId", () => {
    it("should return null if profile does not exist", async () => {
      const profile = await profileRepo.findByUserId(testUser.id);
      expect(profile).toBeNull();
    });

    it("should return profile if exists", async () => {
      // Create profile
      testProfile = await profileRepo.create({
        userId: testUser.id,
        timezone: "America/New_York",
        currency: "USD",
      });

      const found = await profileRepo.findByUserId(testUser.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(testProfile.id);
      expect(found?.userId).toBe(testUser.id);
      expect(found?.timezone).toBe("America/New_York");
      expect(found?.currency).toBe("USD");
    });

    it("should return null for non-existent user", async () => {
      const profile = await profileRepo.findByUserId(randomUUID());
      expect(profile).toBeNull();
    });
  });

  describe("create", () => {
    it("should create profile with default values", async () => {
      testProfile = await profileRepo.create({
        userId: testUser.id,
      });

      expect(testProfile.id).toBeDefined();
      expect(testProfile.userId).toBe(testUser.id);
      expect(testProfile.timezone).toBe("UTC");
      expect(testProfile.currency).toBe("USD");
      expect(testProfile.settings).toBeNull();
      expect(testProfile.createdAt).toBeInstanceOf(Date);
      expect(testProfile.updatedAt).toBeInstanceOf(Date);
    });

    it("should create profile with custom timezone", async () => {
      testProfile = await profileRepo.create({
        userId: testUser.id,
        timezone: "Europe/London",
      });

      expect(testProfile.timezone).toBe("Europe/London");
      expect(testProfile.currency).toBe("USD"); // Default
    });

    it("should create profile with custom currency", async () => {
      testProfile = await profileRepo.create({
        userId: testUser.id,
        currency: "EUR",
      });

      expect(testProfile.timezone).toBe("UTC"); // Default
      expect(testProfile.currency).toBe("EUR");
    });

    it("should create profile with custom settings", async () => {
      const settings = { theme: "dark", notifications: true };
      testProfile = await profileRepo.create({
        userId: testUser.id,
        settings,
      });

      expect(testProfile.settings).toEqual(settings);
    });

    it("should create profile with all custom values", async () => {
      const settings = { language: "en", theme: "light" };
      testProfile = await profileRepo.create({
        userId: testUser.id,
        timezone: "Asia/Tokyo",
        currency: "JPY",
        settings,
      });

      expect(testProfile.timezone).toBe("Asia/Tokyo");
      expect(testProfile.currency).toBe("JPY");
      expect(testProfile.settings).toEqual(settings);
    });
  });

  describe("update", () => {
    beforeEach(async () => {
      // Create profile for update tests
      testProfile = await profileRepo.create({
        userId: testUser.id,
        timezone: "UTC",
        currency: "USD",
      });
    });

    it("should update timezone", async () => {
      const updated = await profileRepo.update(testProfile!.id, {
        timezone: "America/Los_Angeles",
      });

      expect(updated.timezone).toBe("America/Los_Angeles");
      expect(updated.currency).toBe("USD"); // Unchanged
      expect(updated.id).toBe(testProfile!.id);
    });

    it("should update currency", async () => {
      const updated = await profileRepo.update(testProfile!.id, {
        currency: "GBP",
      });

      expect(updated.currency).toBe("GBP");
      expect(updated.timezone).toBe("UTC"); // Unchanged
    });

    it("should update settings", async () => {
      const newSettings = { theme: "dark", language: "es" };
      const updated = await profileRepo.update(testProfile!.id, {
        settings: newSettings,
      });

      expect(updated.settings).toEqual(newSettings);
    });

    it("should update multiple fields at once", async () => {
      const newSettings = { notifications: false };
      const updated = await profileRepo.update(testProfile!.id, {
        timezone: "Europe/Paris",
        currency: "EUR",
        settings: newSettings,
      });

      expect(updated.timezone).toBe("Europe/Paris");
      expect(updated.currency).toBe("EUR");
      expect(updated.settings).toEqual(newSettings);
    });

    it("should update updatedAt timestamp", async () => {
      const originalUpdatedAt = testProfile!.updatedAt;

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await profileRepo.update(testProfile!.id, {
        timezone: "America/Chicago",
      });

      expect(updated.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime()
      );
    });

    it("should throw error if profile not found", async () => {
      await expect(
        profileRepo.update("nonexistent-profile-id", {
          timezone: "UTC",
        })
      ).rejects.toThrow();
    });
  });
});

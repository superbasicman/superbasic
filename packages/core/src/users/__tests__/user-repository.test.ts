/**
 * User Repository Integration Tests
 * 
 * Tests repository methods with real test database
 */

import { randomUUID } from "crypto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@repo/database";
import { UserRepository } from "../user-repository.js";
import type { User } from "@repo/database";

describe("UserRepository", () => {
  let userRepo: UserRepository;
  let testUsers: User[] = [];
  const uniqueEmail = () => `test-${randomUUID()}@example.com`;

  beforeEach(async () => {
    userRepo = new UserRepository(prisma);
    testUsers = [];
  });

  afterEach(async () => {
    // Cleanup: delete all test users (cascades to profiles)
    for (const user of testUsers) {
      await prisma.user.delete({
        where: { id: user.id },
      }).catch(() => {
        // Ignore errors if user already deleted
      });
    }
    testUsers = [];
  });

  describe("findByEmail", () => {
    it("should return null if user does not exist", async () => {
      const user = await userRepo.findByEmail("nonexistent@example.com");
      expect(user).toBeNull();
    });

    it("should return user if found", async () => {
      // Create test user
      const email = uniqueEmail();
      const created = await userRepo.create({
        email,
        password: "hashed_password",
        name: "Test User",
      });
      testUsers.push(created);

      const found = await userRepo.findByEmail(email);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.email).toBe(email);
      expect(found?.name).toBe("Test User");
    });

    it("should be case-insensitive for email lookup", async () => {
      // Create user with lowercase email
      const email = uniqueEmail();
      const created = await userRepo.create({
        email: email.toLowerCase(),
        password: "hashed_password",
        name: "Test User",
      });
      testUsers.push(created);

      // Try to find with uppercase (should still find)
      const found = await userRepo.findByEmail(email.toUpperCase());
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
    });
  });

  describe("create", () => {
    it("should create user successfully", async () => {
      const email = uniqueEmail();
      const user = await userRepo.create({
        email,
        password: "hashed_password_123",
        name: "John Doe",
      });
      testUsers.push(user);

      expect(user.id).toBeDefined();
      expect(user.email).toBe(email);
      expect(user.password).toBe("hashed_password_123");
      expect(user.name).toBe("John Doe");
      expect(user.emailVerified).toBeNull();
      expect(user.image).toBeNull();
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it("should create user with null name", async () => {
      const email = uniqueEmail();
      const user = await userRepo.create({
        email,
        password: "hashed_password",
        name: null,
      });
      testUsers.push(user);

      expect(user.name).toBeNull();
    });

    it("should fail if email already exists", async () => {
      const email = uniqueEmail();
      
      // Create first user
      const user1 = await userRepo.create({
        email,
        password: "password1",
        name: "User 1",
      });
      testUsers.push(user1);

      // Try to create second user with same email
      await expect(
        userRepo.create({
          email,
          password: "password2",
          name: "User 2",
        })
      ).rejects.toThrow();
    });
  });

  describe("createWithProfile", () => {
    it("should create user and profile in transaction", async () => {
      const email = uniqueEmail();
      const user = await userRepo.createWithProfile(
        {
          email,
          password: "hashed_password",
          name: "Jane Doe",
        },
        {
          userId: "", // Will be set by transaction
          timezone: "America/New_York",
          currency: "USD",
        }
      );
      testUsers.push(user);

      // Verify user was created
      expect(user.id).toBeDefined();
      expect(user.email).toBe(email);
      expect(user.name).toBe("Jane Doe");

      // Verify profile was created
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });
      expect(profile).not.toBeNull();
      expect(profile?.userId).toBe(user.id);
      expect(profile?.timezone).toBe("America/New_York");
      expect(profile?.currency).toBe("USD");
    });

    it("should create user with default profile settings", async () => {
      const email = uniqueEmail();
      const user = await userRepo.createWithProfile(
        {
          email,
          password: "hashed_password",
          name: null,
        },
        {
          userId: "",
          timezone: "UTC",
          currency: "USD",
        }
      );
      testUsers.push(user);

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
      });
      expect(profile?.timezone).toBe("UTC");
      expect(profile?.currency).toBe("USD");
    });

    it("should rollback both user and profile if profile creation fails", async () => {
      const email = uniqueEmail();

      // Create first user with profile
      const user1 = await userRepo.createWithProfile(
        {
          email,
          password: "password1",
          name: "User 1",
        },
        {
          userId: "",
          timezone: "UTC",
          currency: "USD",
        }
      );
      testUsers.push(user1);

      // Try to create second user with same email (should fail and rollback)
      await expect(
        userRepo.createWithProfile(
          {
            email, // Duplicate email
            password: "password2",
            name: "User 2",
          },
          {
            userId: "",
            timezone: "UTC",
            currency: "USD",
          }
        )
      ).rejects.toThrow();

      // Verify no orphaned profile was created
      const normalizedEmail = email.toLowerCase();
      const profiles = await prisma.profile.findMany({
        where: {
          user: {
            emailLower: normalizedEmail,
          },
        },
      });
      // Should only have profile for first user
      expect(profiles).toHaveLength(1);
      const [profile] = profiles;
      expect(profile).toBeDefined();
      expect(profile!.userId).toBe(user1.id);
    });

    it("should handle transaction atomicity", async () => {
      const email = uniqueEmail();

      // Ensure no existing records for this email
      const normalizedEmail = email.toLowerCase();
      const existingUser = await prisma.user.findUnique({
        where: { emailLower: normalizedEmail },
      });
      expect(existingUser).toBeNull();
      const existingProfileCount = await prisma.profile.count({
        where: { user: { emailLower: normalizedEmail } },
      });
      expect(existingProfileCount).toBe(0);

      // Create user with profile
      const user = await userRepo.createWithProfile(
        {
          email,
          password: "hashed_password",
          name: "Transaction Test",
        },
        {
          userId: "",
          timezone: "Europe/London",
          currency: "GBP",
        }
      );
      testUsers.push(user);

      // Verify user exists and has profile
      const createdUser = await prisma.user.findUnique({
        where: { emailLower: email.toLowerCase() },
        include: { profile: true },
      });
      expect(createdUser).not.toBeNull();
      expect(createdUser?.profile).not.toBeNull();
      expect(createdUser?.profile?.timezone).toBe("Europe/London");
      expect(createdUser?.profile?.currency).toBe("GBP");

      // Ensure exactly one profile linked to the created user
      const profileCountForUser = await prisma.profile.count({
        where: { userId: user.id },
      });
      expect(profileCountForUser).toBe(1);
    });
  });
});

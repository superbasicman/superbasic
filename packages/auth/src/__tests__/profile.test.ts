/**
 * Tests for profile management utilities
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ensureProfileExists } from "../profile.js";
import { prisma } from "@repo/database";

// Mock Prisma client
vi.mock("@repo/database", () => ({
  prisma: {
    profile: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe("ensureProfileExists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return existing profile ID if profile exists", async () => {
    const userId = "user-123";
    const profileId = "profile-456";

    // Mock existing profile
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      id: profileId,
    } as any);

    const result = await ensureProfileExists(userId);

    expect(result).toBe(profileId);
    expect(prisma.profile.findUnique).toHaveBeenCalledWith({
      where: { userId },
      select: { id: true },
    });
    expect(prisma.profile.create).not.toHaveBeenCalled();
  });

  it("should create new profile if none exists", async () => {
    const userId = "user-789";
    const newProfileId = "profile-new-123";

    // Mock no existing profile
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(null);

    // Mock profile creation
    vi.mocked(prisma.profile.create).mockResolvedValue({
      id: newProfileId,
    } as any);

    const result = await ensureProfileExists(userId);

    expect(result).toBe(newProfileId);
    expect(prisma.profile.findUnique).toHaveBeenCalledWith({
      where: { userId },
      select: { id: true },
    });
    expect(prisma.profile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId,
          timezone: "UTC",
          currency: "USD",
        }),
        select: { id: true },
      })
    );
  });

  it("should use default timezone UTC", async () => {
    const userId = "user-default-tz";

    vi.mocked(prisma.profile.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.profile.create).mockResolvedValue({
      id: "profile-123",
    } as any);

    await ensureProfileExists(userId);

    expect(prisma.profile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          timezone: "UTC",
        }),
      })
    );
  });

  it("should use default currency USD", async () => {
    const userId = "user-default-currency";

    vi.mocked(prisma.profile.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.profile.create).mockResolvedValue({
      id: "profile-123",
    } as any);

    await ensureProfileExists(userId);

    expect(prisma.profile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currency: "USD",
        }),
      })
    );
  });

  it("should include userId in profile data", async () => {
    const userId = "user-default-settings";

    vi.mocked(prisma.profile.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.profile.create).mockResolvedValue({
      id: "profile-123",
    } as any);

    await ensureProfileExists(userId);

    expect(prisma.profile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId,
        }),
      })
    );
  });

  it("should be idempotent - safe to call multiple times", async () => {
    const userId = "user-idempotent";
    const profileId = "profile-same";

    // Mock existing profile on all calls
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      id: profileId,
    } as any);

    // Call multiple times
    const result1 = await ensureProfileExists(userId);
    const result2 = await ensureProfileExists(userId);
    const result3 = await ensureProfileExists(userId);

    // Should return same profile ID each time
    expect(result1).toBe(profileId);
    expect(result2).toBe(profileId);
    expect(result3).toBe(profileId);

    // Should only check for existing profile, never create
    expect(prisma.profile.findUnique).toHaveBeenCalledTimes(3);
    expect(prisma.profile.create).not.toHaveBeenCalled();
  });

  it("should handle database errors gracefully", async () => {
    const userId = "user-error";
    const dbError = new Error("Database connection failed");

    vi.mocked(prisma.profile.findUnique).mockRejectedValue(dbError);

    await expect(ensureProfileExists(userId)).rejects.toThrow(
      "Database connection failed"
    );
  });
});

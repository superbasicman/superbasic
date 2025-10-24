/**
 * Profile management utilities
 * 
 * Ensures that every Auth.js user has a corresponding profile record.
 * Profiles store user preferences and own business logic data.
 */

import { prisma } from "@repo/database";

/**
 * Ensures a profile exists for the given user ID.
 * Creates a profile with default settings if one doesn't exist.
 * 
 * This function is idempotent - safe to call multiple times for the same user.
 * 
 * @param userId - The Auth.js user ID (UUID)
 * @returns The profile ID (existing or newly created)
 * 
 * @example
 * ```typescript
 * // In Auth.js signIn callback
 * const profileId = await ensureProfileExists(user.id);
 * ```
 */
export async function ensureProfileExists(userId: string): Promise<string> {
  // Check if profile already exists
  const existingProfile = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (existingProfile) {
    return existingProfile.id;
  }

  // Create new profile with default settings
  const newProfile = await prisma.profile.create({
    data: {
      userId,
      timezone: "UTC",
      currency: "USD",
      settings: null,
    },
    select: { id: true },
  });

  return newProfile.id;
}

/**
 * Profile management utilities
 *
 * Ensures that every Auth.js user has a corresponding profile record.
 * Profiles store user preferences and own business logic data.
 */

import { createAuthService } from '@repo/auth-core';
import { prisma } from '@repo/database';

const authServicePromise = createAuthService({ prisma });

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
  // Delegate to auth-core service which handles profile creation via data layer
  const authService = await authServicePromise;
  return authService.ensureProfileExists(userId);
}

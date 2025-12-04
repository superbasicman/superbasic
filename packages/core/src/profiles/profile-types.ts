/**
 * Profile Domain Types
 *
 * Type definitions for profile service operations.
 */

import { z } from 'zod';

/**
 * Zod schema for profile updates
 */
export const UpdateProfileSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    timezone: z.string().optional(),
    currency: z.string().length(3).optional(),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

/**
 * Parameters for getting current profile
 */
export interface GetProfileParams {
  userId: string;
}

/**
 * Profile response structure
 */
export interface ProfileResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
    profile: {
      id: string;
      timezone: string;
      currency: string;
    } | null;
  };
}

/**
 * Parameters for updating profile
 */
export interface UpdateProfileParams {
  userId: string;
  profileId?: string;
  name?: string;
  timezone?: string;
  currency?: string;
}

/**
 * Data to update in profile table
 */
export interface UpdateProfileData {
  timezone?: string;
  currency?: string;
}

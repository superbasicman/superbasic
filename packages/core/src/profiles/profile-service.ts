/**
 * Profile Service
 * 
 * Business logic layer for profile operations.
 * Orchestrates profile and user data access through repositories.
 */

import type { PrismaClient } from '@repo/database';
import { ProfileRepository } from './profile-repository.js';
import { ProfileNotFoundError, InvalidProfileDataError } from './profile-errors.js';
import type {
  GetProfileParams,
  ProfileResponse,
  UpdateProfileParams,
  UpdateProfileData,
  UpdateProfileInput,
} from './profile-types.js';
import { UpdateProfileSchema } from './profile-types.js';

export class ProfileService {
  private profileRepo: ProfileRepository;

  constructor(private prisma: PrismaClient) {
    this.profileRepo = new ProfileRepository(prisma);
  }

  /**
   * Get current user profile
   * 
   * Fetches user data along with associated profile information.
   * 
   * @param params - User ID to fetch profile for
   * @returns Profile response with user and profile data
   * @throws ProfileNotFoundError if user doesn't exist
   */
  async getCurrentProfile(params: GetProfileParams): Promise<ProfileResponse> {
    const { userId } = params;

    // Fetch user and profile from database
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        profile: {
          select: {
            id: true,
            timezone: true,
            currency: true,
          },
        },
      },
    });

    if (!user) {
      throw new ProfileNotFoundError(userId);
    }

    return this.mapToProfileResponse(user);
  }

  /**
   * Update user profile
   * 
   * Updates user name and/or profile settings (timezone, currency).
   * Validates input data before applying updates.
   * 
   * @param params - Update parameters including userId, profileId, and fields to update
   * @returns Updated profile response
   * @throws InvalidProfileDataError if validation fails
   * @throws ProfileNotFoundError if user doesn't exist after update
   */
  async updateProfile(params: UpdateProfileParams): Promise<ProfileResponse> {
    const { userId, profileId, name, timezone, currency } = params;

    // Validate profile data
    this.validateProfileData({ name, timezone, currency });

    // Update user name if provided
    if (name !== undefined) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { name },
      });
    }

    // Update profile if provided and profileId exists
    if ((timezone !== undefined || currency !== undefined) && profileId) {
      const profileData: UpdateProfileData = {};
      
      if (timezone !== undefined) {
        profileData.timezone = timezone;
      }
      
      if (currency !== undefined) {
        profileData.currency = currency;
      }

      await this.profileRepo.update(profileId, profileData);
    }

    // Fetch updated user and profile
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        profile: {
          select: {
            id: true,
            timezone: true,
            currency: true,
          },
        },
      },
    });

    if (!user) {
      throw new ProfileNotFoundError(userId);
    }

    return this.mapToProfileResponse(user);
  }

  /**
   * Validate profile data using Zod schema
   * 
   * @param data - Profile data to validate
   * @throws InvalidProfileDataError if validation fails
   */
  private validateProfileData(data: UpdateProfileInput): void {
    const result = UpdateProfileSchema.safeParse(data);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new InvalidProfileDataError(`Validation failed: ${errors}`);
    }
  }

  /**
   * Map database user object to profile response
   * 
   * @param user - User object from database
   * @returns Formatted profile response
   */
  private mapToProfileResponse(user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: Date;
    profile: {
      id: string;
      timezone: string;
      currency: string;
    } | null;
  }): ProfileResponse {
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt.toISOString(),
        profile: user.profile
          ? {
              id: user.profile.id,
              timezone: user.profile.timezone,
              currency: user.profile.currency,
            }
          : null,
      },
    };
  }
}

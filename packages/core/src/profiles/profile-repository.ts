/**
 * Profile Repository
 *
 * Data access layer for profile operations.
 * Pure Prisma operations with no business logic.
 */

import type { PrismaClient, Profile } from '@repo/database';

export interface CreateProfileData {
  userId: string;
  timezone?: string;
  currency?: string;
  settings?: any;
}

export interface UpdateProfileData {
  timezone?: string;
  currency?: string;
  settings?: any;
}

export class ProfileRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Find profile by user ID
   */
  async findByUserId(userId: string): Promise<Profile | null> {
    return this.prisma.profile.findUnique({
      where: { userId },
    });
  }

  /**
   * Update profile by profile ID
   */
  async update(profileId: string, data: UpdateProfileData): Promise<Profile> {
    return this.prisma.profile.update({
      where: { id: profileId },
      data,
    });
  }

  /**
   * Create a new profile
   */
  async create(data: CreateProfileData): Promise<Profile> {
    return this.prisma.profile.create({
      data: {
        userId: data.userId,
        timezone: data.timezone ?? 'UTC',
        currency: data.currency ?? 'USD',
        settings: data.settings ?? null,
      },
    });
  }
}

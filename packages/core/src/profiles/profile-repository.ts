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

  /**
   * Get the current postgres workspace setting (diagnostic)
   */
  async getCurrentWorkspaceSetting(): Promise<string | null> {
    try {
      const rows = await this.prisma.$queryRaw<{ workspace: string | null }[]>`
        SELECT current_setting('app.workspace_id', true) AS workspace
      `;
      return rows[0]?.workspace ?? null;
    } catch {
      return null;
    }
  }
}

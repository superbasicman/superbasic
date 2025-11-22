/**
 * User Repository
 * 
 * Data access layer for user operations.
 * Pure Prisma operations with no business logic.
 */

import type { PrismaClient, User } from '@repo/database';
import type { UserStatus } from './user-types.js';

export interface CreateUserData {
  email: string;
  password: string;
  name: string | null;
}

export interface CreateUserProfileData {
  userId: string;
  timezone: string;
  currency: string;
}

export class UserRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();
    return this.prisma.user.findUnique({
      where: { emailLower: normalizedEmail },
    });
  }

  /**
   * Find user by ID
   */
  async findById(userId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
    });
  }

  /**
   * Create a new user
   */
  async create(data: CreateUserData): Promise<User> {
    const normalizedEmail = data.email.trim().toLowerCase();
    return this.prisma.user.create({
      data: {
        email: data.email,
        emailLower: normalizedEmail,
        password: data.password,
        name: data.name,
      },
    });
  }

  /**
   * Create user with profile in a transaction
   * Ensures atomicity - both user and profile are created or neither is
   */
  async createWithProfile(
    userData: CreateUserData,
    profileData: CreateUserProfileData
  ): Promise<User> {
    const normalizedEmail = userData.email.trim().toLowerCase();
    return this.prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email: userData.email,
          emailLower: normalizedEmail,
          password: userData.password,
          name: userData.name,
        },
      });

      // Create profile
      await tx.profile.create({
        data: {
          userId: user.id,
          timezone: profileData.timezone,
          currency: profileData.currency,
        },
      });

      return user;
    });
  }

  /**
   * Update a user's status and return previous value
   */
  async updateStatus(
    userId: string,
    status: UserStatus
  ): Promise<{ user: User; previousStatus: UserStatus } | null> {
    // Fast-return for obviously invalid IDs to avoid Prisma UUID parse errors
    if (!isValidUuid(userId)) {
      return null;
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      return null;
    }

    if (existing.status === status) {
      return { user: existing, previousStatus: existing.status };
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status },
    });

    return { user: updated, previousStatus: existing.status };
  }
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

/**
 * User Repository
 * 
 * Data access layer for user operations.
 * Pure Prisma operations with no business logic.
 */

import type { PrismaClient, User } from '@repo/database';

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
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Create a new user
   */
  async create(data: CreateUserData): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: data.email,
        password: data.password,
        name: data.name,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        emailVerified: true,
        image: true,
        password: true,
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
    return this.prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email: userData.email,
          password: userData.password,
          name: userData.name,
        },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          emailVerified: true,
          image: true,
          password: true,
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
}

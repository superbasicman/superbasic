/**
 * User Repository
 *
 * Data access layer for user operations.
 * Pure Prisma operations with no business logic.
 */

import type { PrismaClient, User, UserState } from '@repo/database';

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
    const normalizedEmail = email.toLowerCase().trim();
    return this.prisma.user.findFirst({
      where: {
        primaryEmail: normalizedEmail,
        deletedAt: null,
      },
    });
  }

  /**
   * Find user by email including password relation
   */
  async findByEmailWithPassword(email: string): Promise<(User & { password?: { passwordHash: string } | null }) | null> {
    const normalizedEmail = email.toLowerCase().trim();
    return this.prisma.user.findFirst({
      where: {
        primaryEmail: normalizedEmail,
        deletedAt: null,
      },
      include: { password: true },
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
   * Find user details for token/id_token payloads
   */
  async findProfileForTokenPayload(userId: string): Promise<{
    primaryEmail: string | null;
    emailVerified: boolean | null;
    displayName: string | null;
    picture: string | null;
  } | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        primaryEmail: true,
        emailVerified: true,
        displayName: true,
        picture: true,
      },
    });
  }

  /**
   * Find user by ID with limited fields for session responses
   */
  async findSummaryById(userId: string): Promise<{
    id: string;
    primaryEmail: string;
    displayName: string | null;
    userState: UserState;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        primaryEmail: true,
        displayName: true,
        userState: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Get email verification status for a user
   * Returns null if user not found
   */
  async getEmailVerifiedStatus(userId: string): Promise<boolean | null> {
    // Fast-return for obviously invalid IDs to avoid Prisma UUID parse errors
    if (!isValidUuid(userId)) {
      return null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true },
    });

    return user?.emailVerified ?? null;
  }

  /**
   * Create a new user
   */
  async create(data: CreateUserData): Promise<User> {
    const normalizedEmail = data.email.toLowerCase().trim();
    return this.prisma.user.create({
      data: {
        primaryEmail: normalizedEmail,
        displayName: data.name,
        userState: 'active',
        password: {
          create: {
            passwordHash: data.password,
          },
        },
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
    const normalizedEmail = userData.email.toLowerCase().trim();
    return this.prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          primaryEmail: normalizedEmail,
          displayName: userData.name,
          userState: 'active',
          password: {
            create: {
              passwordHash: userData.password,
            },
          },
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
   * Create a passwordless user with profile for identity providers (e.g., magic link)
   */
  async createUserWithProfileOnly(params: {
    email: string;
    emailVerified?: boolean;
    displayName?: string | null;
    timezone?: string;
    currency?: string;
  }): Promise<User> {
    const normalizedEmail = params.email.toLowerCase().trim();
    return this.prisma.user.create({
      data: {
        primaryEmail: normalizedEmail,
        displayName: params.displayName ?? null,
        emailVerified: params.emailVerified ?? false,
        userState: 'active',
        profile: {
          create: {
            timezone: params.timezone ?? 'UTC',
            currency: params.currency ?? 'USD',
          },
        },
      },
    });
  }

  /**
   * Update a user's status and return previous value
   */
  async updateStatus(
    userId: string,
    status: UserState
  ): Promise<{ user: User; previousStatus: UserState } | null> {
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

    if (existing.userState === status) {
      return { user: existing, previousStatus: existing.userState };
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { userState: status },
    });

    return { user: updated, previousStatus: existing.userState };
  }

  /**
   * Mark a user's email as verified
   */
  async verifyEmail(userId: string): Promise<User | null> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });
  }
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

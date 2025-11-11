/**
 * Token Repository
 * 
 * Data access layer for API tokens
 * Pure Prisma operations with no business logic
 */

import type { PrismaClient, ApiKey } from "@repo/database";

export interface CreateTokenData {
  userId: string;
  profileId: string;
  name: string;
  keyHash: string;
  last4: string;
  scopes: string[];
  expiresAt?: Date | null;
}

export interface UpdateTokenData {
  name: string;
}

export class TokenRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Check if a token with the given name exists for a user
   * Only checks active tokens (not revoked)
   */
  async existsByUserAndName(userId: string, name: string): Promise<boolean> {
    const count = await this.prisma.apiKey.count({
      where: {
        userId,
        name,
        revokedAt: null, // Only check active tokens
      },
    });
    return count > 0;
  }

  /**
   * Create a new token record
   */
  async create(data: CreateTokenData): Promise<ApiKey> {
    return this.prisma.apiKey.create({
      data: {
        userId: data.userId,
        profileId: data.profileId,
        name: data.name,
        keyHash: data.keyHash,
        last4: data.last4,
        scopes: data.scopes,
        expiresAt: data.expiresAt ?? null,
      },
    });
  }

  /**
   * Find token by ID
   */
  async findById(id: string): Promise<ApiKey | null> {
    return this.prisma.apiKey.findUnique({
      where: { id },
    });
  }

  /**
   * Find all active tokens for a user
   * Excludes revoked tokens and sorts by creation date (newest first)
   */
  async findActiveByUserId(userId: string): Promise<ApiKey[]> {
    return this.prisma.apiKey.findMany({
      where: {
        userId,
        revokedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Update token name
   */
  async update(id: string, data: UpdateTokenData): Promise<ApiKey> {
    return this.prisma.apiKey.update({
      where: { id },
      data: { name: data.name },
    });
  }

  /**
   * Soft delete token by setting revokedAt timestamp
   */
  async revoke(id: string): Promise<void> {
    await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }
}

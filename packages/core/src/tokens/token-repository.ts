/**
 * Token Repository
 *
 * Data access layer for API tokens
 * Pure Prisma operations with no business logic
 */

import crypto from 'node:crypto';
import type { PrismaClient, ApiKey } from '@repo/database';
import type { TokenHashEnvelope } from '@repo/auth-core';

export interface CreateTokenData {
  id?: string;
  userId: string;
  name: string;
  keyHash: TokenHashEnvelope;
  last4: string;
  scopes: string[];
  workspaceId?: string | null;
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
        id: data.id ?? crypto.randomUUID(),
        userId: data.userId,
        name: data.name,
        keyHash: data.keyHash,
        last4: data.last4,
        scopes: data.scopes,
        workspaceId: data.workspaceId ?? null,
        expiresAt: data.expiresAt ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Default 1 year if missing? Schema says expiresAt is required.
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
      orderBy: { createdAt: 'desc' },
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

  /**
   * Soft delete token by id without throwing when missing
   */
  async revokeById(id: string, revokedAt: Date): Promise<void> {
    await this.prisma.apiKey.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt },
    });
  }
}

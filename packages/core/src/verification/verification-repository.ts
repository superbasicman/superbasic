/**
 * Verification Repository
 *
 * Data access layer for verification tokens
 * Pure Prisma operations with no business logic
 */

import type {
  PrismaClient,
  VerificationToken,
  VerificationTokenType,
} from '@repo/database';
import type { TokenHashEnvelope } from '@repo/auth';

export interface CreateVerificationTokenData {
  identifier: string;
  tokenId: string;
  hashEnvelope: TokenHashEnvelope;
  type: VerificationTokenType;
  expiresAt: Date;
}

export class VerificationRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new verification token record
   */
  async create(data: CreateVerificationTokenData): Promise<VerificationToken> {
    return this.prisma.verificationToken.create({
      data: {
        identifier: data.identifier,
        tokenId: data.tokenId,
        hashEnvelope: data.hashEnvelope,
        type: data.type,
        expiresAt: data.expiresAt,
      },
    });
  }

  /**
   * Find token by tokenId
   */
  async findByTokenId(tokenId: string): Promise<VerificationToken | null> {
    return this.prisma.verificationToken.findFirst({
      where: { tokenId },
    });
  }

  /**
   * Find valid (not consumed, not expired) token by email and type
   */
  async findValidByEmail(
    email: string,
    type: VerificationTokenType
  ): Promise<VerificationToken | null> {
    return this.prisma.verificationToken.findFirst({
      where: {
        identifier: email.toLowerCase(),
        type,
        expiresAt: { gt: new Date() },
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Mark token as consumed
   */
  async markConsumed(id: string): Promise<void> {
    await this.prisma.verificationToken.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
  }

  /**
   * Invalidate all tokens for an email and type (mark as consumed)
   */
  async invalidateAllForEmail(
    email: string,
    type: VerificationTokenType
  ): Promise<void> {
    await this.prisma.verificationToken.updateMany({
      where: {
        identifier: email.toLowerCase(),
        type,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });
  }
}

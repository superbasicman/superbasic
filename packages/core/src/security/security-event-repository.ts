import { Prisma } from '@repo/database';
import type { PrismaClient } from '@repo/database';

export type SecurityEventCreateParams = {
  userId?: string | null;
  workspaceId?: string | null;
  serviceId?: string | null;
  eventType: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue | null | undefined;
};

export class SecurityEventRepository {
  constructor(private prisma: PrismaClient) {}

  async create(params: SecurityEventCreateParams) {
    return this.prisma.securityEvent.create({
      data: {
        userId: params.userId ?? null,
        workspaceId: params.workspaceId ?? null,
        serviceId: params.serviceId ?? null,
        eventType: params.eventType,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
        metadata: params.metadata ?? Prisma.DbNull,
      },
    });
  }

  async findRecentIdentityUnlink(email: string, cutoff: Date) {
    return this.prisma.securityEvent.findFirst({
      where: {
        eventType: 'identity.unlinked',
        metadata: {
          path: ['email'],
          equals: email,
        },
        createdAt: { gte: cutoff },
      },
    });
  }
}

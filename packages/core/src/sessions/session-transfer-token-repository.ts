import type { PrismaClient, PrismaClientOrTransaction } from '@repo/database';
import type { TokenHashEnvelope } from '@repo/auth-core';

export type SessionTransferTokenRecord = {
  id: string;
  sessionId: string;
  hashEnvelope: TokenHashEnvelope;
  expiresAt: Date;
  usedAt: Date | null;
  clientId: string | null;
};

export class SessionTransferTokenRepository {
  constructor(private prisma: PrismaClient) {}

  private getClient(client?: PrismaClientOrTransaction): PrismaClientOrTransaction {
    return client ?? this.prisma;
  }

  async create(params: {
    id: string;
    sessionId: string;
    hashEnvelope: TokenHashEnvelope;
    expiresAt: Date;
    createdIp: string | null;
    userAgent: string | null;
    clientId?: string | null;
  }): Promise<SessionTransferTokenRecord> {
    const record = await this.prisma.sessionTransferToken.create({
      data: {
        id: params.id,
        sessionId: params.sessionId,
        hashEnvelope: params.hashEnvelope,
        expiresAt: params.expiresAt,
        createdIp: params.createdIp,
        userAgent: params.userAgent,
        clientId: params.clientId ?? null,
      },
    });

    return mapRecord({
      id: record.id,
      sessionId: record.sessionId,
      hashEnvelope: record.hashEnvelope as TokenHashEnvelope,
      expiresAt: record.expiresAt,
      usedAt: record.usedAt,
      clientId: record.clientId,
    });
  }

  async findValidToken(
    tokenId: string,
    options: { clientId?: string | null } = {}
  ): Promise<
    | (SessionTransferTokenRecord & {
        session: { id: string; userId: string; expiresAt: Date; revokedAt: Date | null } | null;
      })
    | null
  > {
    const token = await this.prisma.sessionTransferToken.findFirst({
      where: {
        id: tokenId,
        expiresAt: { gt: new Date() },
        usedAt: null,
        ...(options.clientId ? { clientId: { equals: options.clientId } } : {}),
      },
      select: {
        id: true,
        sessionId: true,
        hashEnvelope: true,
        expiresAt: true,
        usedAt: true,
        clientId: true,
        session: {
          select: {
            id: true,
            userId: true,
            expiresAt: true,
            revokedAt: true,
          },
        },
      },
    });

    if (!token || !token.hashEnvelope) {
      return null;
    }

    return {
      ...mapRecord({
        id: token.id,
        sessionId: token.sessionId,
        hashEnvelope: token.hashEnvelope as TokenHashEnvelope,
        expiresAt: token.expiresAt,
        usedAt: token.usedAt,
        clientId: token.clientId,
      }),
      session: token.session,
    };
  }

  async markUsed(tokenId: string, client?: PrismaClientOrTransaction): Promise<void> {
    const db = this.getClient(client);
    await db.sessionTransferToken.update({
      where: { id: tokenId },
      data: { usedAt: new Date() },
    });
  }
}

function mapRecord(record: {
  id: string;
  sessionId: string;
  hashEnvelope: TokenHashEnvelope;
  expiresAt: Date;
  usedAt: Date | null;
  clientId: string | null;
}): SessionTransferTokenRecord {
  return {
    id: record.id,
    sessionId: record.sessionId,
    hashEnvelope: record.hashEnvelope,
    expiresAt: record.expiresAt,
    usedAt: record.usedAt,
    clientId: record.clientId,
  };
}

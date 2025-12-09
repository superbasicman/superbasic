import type { PrismaClient, Prisma, PrismaClientOrTransaction, AuthSession } from '@repo/database';

export type SessionWithUser = {
  id: string;
  userId: string;
  revokedAt: Date | null;
  user: { primaryEmail: string | null };
};

type SessionMfaLevel = AuthSession['mfaLevel'];

export type SessionDetails = {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
  mfaLevel: SessionMfaLevel;
  ipAddress: string | null;
  clientInfo: Prisma.JsonValue | null;
};

export class SessionRepository {
  constructor(private prisma: PrismaClient) {}

  private getClient(client?: PrismaClientOrTransaction): PrismaClientOrTransaction {
    return client ?? this.prisma;
  }

  async findByIdForUser(
    sessionId: string,
    userId: string,
    client?: PrismaClientOrTransaction
  ): Promise<SessionWithUser | null> {
    const db = this.getClient(client);
    return db.authSession.findFirst({
      where: { id: sessionId, userId },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
        user: { select: { primaryEmail: true } },
      },
    }) as Promise<SessionWithUser | null>;
  }

  async findManyActiveSessionIdsForUser(
    userId: string,
    client?: PrismaClientOrTransaction
  ): Promise<string[]> {
    const db = this.getClient(client);
    const sessions = await db.authSession.findMany({
      where: {
        userId,
        revokedAt: null,
      },
      select: { id: true },
    });
    return sessions.map((s) => s.id);
  }

  async findDetailsForUser(
    sessionId: string,
    userId: string,
    client?: PrismaClientOrTransaction
  ): Promise<SessionDetails | null> {
    const db = this.getClient(client);
    return db.authSession.findFirst({
      where: { id: sessionId, userId },
      select: {
        id: true,
        createdAt: true,
        lastActivityAt: true,
        expiresAt: true,
        mfaLevel: true,
        ipAddress: true,
        clientInfo: true,
      },
    }) as Promise<SessionDetails | null>;
  }

  async listActiveSessionsForUser(
    userId: string,
    options: { now?: Date; client?: PrismaClientOrTransaction } = {}
  ): Promise<SessionDetails[]> {
    const db = this.getClient(options.client);
    const now = options.now ?? new Date();
    return db.authSession.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: [{ lastActivityAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        createdAt: true,
        lastActivityAt: true,
        expiresAt: true,
        ipAddress: true,
        clientInfo: true,
        mfaLevel: true,
      },
    }) as Promise<SessionDetails[]>;
  }

  async findActiveById(
    sessionId: string
  ): Promise<{ id: string; userId: string; expiresAt: Date; revokedAt: Date | null } | null> {
    return this.prisma.authSession.findFirst({
      where: { id: sessionId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userId: true, expiresAt: true, revokedAt: true },
    });
  }

  async findManyActiveForUsers(userIds: string[]): Promise<Array<{ id: string; userId: string }>> {
    if (userIds.length === 0) {
      return [];
    }
    return this.prisma.authSession.findMany({
      where: {
        userId: { in: userIds },
        revokedAt: null,
      },
      select: {
        id: true,
        userId: true,
      },
    });
  }

  async findOwners(sessionIds: string[]): Promise<Array<{ id: string; userId: string }>> {
    if (sessionIds.length === 0) {
      return [];
    }
    return this.prisma.authSession.findMany({
      where: { id: { in: sessionIds } },
      select: { id: true, userId: true },
    });
  }

  async revokeSessionAndRefreshTokens(
    sessionId: string,
    options: { client?: PrismaClientOrTransaction; skipSessionUpdate?: boolean } = {}
  ): Promise<void> {
    const { client, skipSessionUpdate } = options;
    const db = this.getClient(client);
    const now = new Date();

    const runInTransaction = async (action: (tx: Prisma.TransactionClient) => Promise<void>) => {
      if (isPrismaClient(db)) {
        return db.$transaction((tx) => action(tx as Prisma.TransactionClient));
      }
      return action(db as Prisma.TransactionClient);
    };

    await runInTransaction(async (tx) => {
      if (!skipSessionUpdate) {
        await tx.authSession.updateMany({
          where: { id: sessionId },
          data: { revokedAt: now, lastActivityAt: now },
        });
      }

      await tx.refreshToken.updateMany({
        where: {
          sessionId,
          revokedAt: null,
        },
        data: { revokedAt: now, lastUsedAt: now },
      });
    });
  }

  async updateActivityAndExpiry(
    sessionId: string,
    data: { lastActivityAt: Date; expiresAt: Date },
    client?: PrismaClientOrTransaction
  ): Promise<{ expiresAt: Date } | null> {
    const db = this.getClient(client);
    try {
      return await db.authSession.update({
        where: { id: sessionId },
        data: {
          lastActivityAt: data.lastActivityAt,
          expiresAt: data.expiresAt,
        },
        select: { expiresAt: true },
      });
    } catch (error) {
      if (isPrismaNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }
}

function isPrismaClient(client: PrismaClientOrTransaction): client is PrismaClient {
  return typeof (client as PrismaClient).$transaction === 'function';
}

function isPrismaNotFoundError(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && (error as any).code === 'P2025';
}

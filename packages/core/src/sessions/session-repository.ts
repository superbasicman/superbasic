import type { PrismaClient, Prisma, PrismaClientOrTransaction } from '@repo/database';

export type SessionWithUser = {
  id: string;
  userId: string;
  revokedAt: Date | null;
  user: { primaryEmail: string | null };
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
}

function isPrismaClient(client: PrismaClientOrTransaction): client is PrismaClient {
  return typeof (client as PrismaClient).$transaction === 'function';
}


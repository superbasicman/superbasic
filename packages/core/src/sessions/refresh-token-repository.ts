import { Prisma } from '@repo/database';
import type {
  AuthSession,
  PrismaClient,
  PrismaClientOrTransaction,
  RefreshToken,
  UserState,
} from '@repo/database';

type RefreshTokenWithSession = RefreshToken & {
  session: {
    id: string;
    revokedAt: Date | null;
    expiresAt: Date;
    mfaLevel: AuthSession['mfaLevel'];
    lastActivityAt: Date | null;
    clientInfo: Prisma.JsonValue | null;
    user: { id: string; userState: UserState } | null;
  } | null;
};

export class RefreshTokenRepository {
  constructor(private prisma: PrismaClient) {}

  private getClient(client?: PrismaClientOrTransaction): PrismaClientOrTransaction {
    return client ?? this.prisma;
  }

  async findWithSession(
    tokenId: string,
    client?: PrismaClientOrTransaction
  ): Promise<RefreshTokenWithSession | null> {
    const db = this.getClient(client);
    return db.refreshToken.findUnique({
      where: { id: tokenId },
      include: {
        session: {
          include: {
            user: {
              select: {
                id: true,
                userState: true,
              },
            },
          },
        },
      },
    });
  }

  async findRevokedAt(
    tokenId: string,
    client?: PrismaClientOrTransaction
  ): Promise<Date | null> {
    const db = this.getClient(client);
    const record = await db.refreshToken.findUnique({
      where: { id: tokenId },
      select: { revokedAt: true },
    });
    return record?.revokedAt ?? null;
  }

  async findActiveSiblingForFamily(
    familyId: string,
    client?: PrismaClientOrTransaction
  ): Promise<RefreshToken | null> {
    const db = this.getClient(client);
    return db.refreshToken.findFirst({
      where: {
        familyId,
        revokedAt: null,
      },
    });
  }

  async revokeFamilyAndSession(
    familyId: string,
    sessionId: string,
    timestamp: Date,
    client?: PrismaClientOrTransaction
  ): Promise<void> {
    const db = this.getClient(client);
    const runInTransaction = async (action: (tx: PrismaClientOrTransaction) => Promise<void>) => {
      if (isPrismaClient(db)) {
        return db.$transaction((tx) => action(tx));
      }
      return action(db);
    };

    await runInTransaction(async (tx) => {
      await tx.refreshToken.updateMany({
        where: { familyId },
        data: { revokedAt: timestamp },
      });

      await tx.authSession.update({
        where: { id: sessionId },
        data: { revokedAt: timestamp },
      });
    });
  }

  async revokeToken(
    tokenId: string,
    data: {
      revokedAt: Date;
      lastUsedAt: Date;
      lastUsedIp: string | null;
      userAgent: string | null;
    },
    client?: PrismaClientOrTransaction
  ): Promise<'updated' | 'not_found'> {
    const db = this.getClient(client);
    try {
      await db.refreshToken.update({
        where: { id: tokenId, revokedAt: null },
        data: {
          revokedAt: data.revokedAt,
          lastUsedAt: data.lastUsedAt,
          lastUsedIp: data.lastUsedIp ?? null,
          userAgent: data.userAgent ?? null,
        },
      });
      return 'updated';
    } catch (error) {
      if (isPrismaNotFoundError(error)) {
        return 'not_found';
      }
      throw error;
    }
  }

  async revokeById(
    tokenId: string,
    revokedAt: Date,
    client?: PrismaClientOrTransaction
  ): Promise<void> {
    const db = this.getClient(client);
    await db.refreshToken.updateMany({
      where: { id: tokenId, revokedAt: null },
      data: { revokedAt },
    });
  }
}

function isPrismaClient(client: PrismaClientOrTransaction): client is PrismaClient {
  return typeof (client as PrismaClient).$transaction === 'function';
}

function isPrismaNotFoundError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
  );
}

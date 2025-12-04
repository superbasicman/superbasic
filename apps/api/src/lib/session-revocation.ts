import { authEvents } from '@repo/auth';
import { prisma } from '@repo/database';
import type { Prisma, PrismaClient, PrismaClientOrTransaction } from '@repo/database';

type RevokeSessionOptions = {
  sessionId: string;
  userId: string;
  revokedBy?: string;
  reason?: string;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  client?: PrismaClientOrTransaction;
};

type RevokedSessionInfo = {
  id: string;
  userId: string;
  email?: string | null;
  wasAlreadyRevoked: boolean;
};

export type RevokeSessionResult =
  | { status: 'not_found' }
  | {
      status: 'revoked';
      session: RevokedSessionInfo;
    };

function isPrismaClient(client: PrismaClientOrTransaction): client is PrismaClient {
  return typeof (client as PrismaClient).$transaction === 'function';
}

export async function revokeSessionForUser(
  options: RevokeSessionOptions
): Promise<RevokeSessionResult> {
  const client = options.client ?? prisma;

  const session = await client.authSession.findFirst({
    where: {
      id: options.sessionId,
      userId: options.userId,
    },
    select: {
      id: true,
      userId: true,
      revokedAt: true,
      user: {
        select: {
          primaryEmail: true,
        },
      },
    },
  });

  if (!session) {
    return { status: 'not_found' };
  }

  const now = new Date();

  const runInTransaction = async (action: (tx: Prisma.TransactionClient) => Promise<void>) => {
    if (isPrismaClient(client)) {
      return client.$transaction((tx) => action(tx as Prisma.TransactionClient));
    }
    // Already inside a transaction
    return action(client as Prisma.TransactionClient);
  };

  await runInTransaction(async (tx) => {
    if (!session.revokedAt) {
      await tx.authSession.update({
        where: { id: session.id },
        data: { revokedAt: now, lastActivityAt: now },
      });
    }

    await tx.refreshToken.updateMany({
      where: {
        sessionId: session.id,
        revokedAt: null,
      },
      data: { revokedAt: now, lastUsedAt: now },
    });
  });

  const timestamp = new Date().toISOString();

  await authEvents.emit({
    type: 'session.revoked',
    userId: session.userId,
    email: session.user?.primaryEmail ?? undefined,
    metadata: {
      sessionId: session.id,
      revokedBy: options.revokedBy ?? null,
      reason: options.reason ?? 'session_revoked',
      ip: options.ipAddress ?? null,
      userAgent: options.userAgent ?? null,
      requestId: options.requestId ?? null,
      timestamp,
    },
  });

  return {
    status: 'revoked',
    session: {
      id: session.id,
      userId: session.userId,
      email: session.user?.primaryEmail ?? null,
      wasAlreadyRevoked: !!session.revokedAt,
    },
  };
}

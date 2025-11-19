import { authEvents } from '@repo/auth';
import { prisma } from '@repo/database';

type RevokeSessionOptions = {
  sessionId: string;
  userId: string;
  revokedBy?: string;
  reason?: string;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
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

export async function revokeSessionForUser(options: RevokeSessionOptions): Promise<RevokeSessionResult> {
  const session = await prisma.session.findFirst({
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
          email: true,
        },
      },
    },
  });

  if (!session) {
    return { status: 'not_found' };
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    if (!session.revokedAt) {
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: now },
      });
    }

    await tx.token.updateMany({
      where: {
        sessionId: session.id,
        type: 'refresh',
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
  });

  const timestamp = new Date().toISOString();

  await authEvents.emit({
    type: 'session.revoked',
    userId: session.userId,
    email: session.user?.email ?? undefined,
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
      email: session.user?.email ?? null,
      wasAlreadyRevoked: !!session.revokedAt,
    },
  };
}

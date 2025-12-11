import { authEvents } from '@repo/auth-core';
import type { PrismaClientOrTransaction } from '@repo/database';
import { sessionRepository } from '../services/index.js';

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

export async function revokeSessionForUser(
  options: RevokeSessionOptions
): Promise<RevokeSessionResult> {
  const session = await sessionRepository.findByIdForUser(
    options.sessionId,
    options.userId,
    options.client
  );

  if (!session) {
    return { status: 'not_found' };
  }

  await sessionRepository.revokeSessionAndRefreshTokens(session.id, {
    ...(options.client ? { client: options.client } : {}),
    skipSessionUpdate: !!session.revokedAt,
  });

  const timestamp = new Date().toISOString();

  await authEvents.emit({
    type: 'session.revoked',
    userId: session.userId,
    email: session.user?.primaryEmail ?? 'unknown',
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

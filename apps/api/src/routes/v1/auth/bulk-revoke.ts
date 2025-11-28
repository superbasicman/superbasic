import type { Context } from 'hono';
import { prisma } from '@repo/database';
import type { AppBindings } from '../../../types/context.js';
import { revokeSessionForUser } from '../../../lib/session-revocation.js';
import { clearRefreshTokenCookie } from './refresh-cookie.js';
import { requireRecentAuth } from '@repo/auth-core';
import { revokePersonalAccessToken } from '../../../lib/pat-tokens.js';

export async function bulkRevokeSessions(c: Context<AppBindings>) {
  const auth = c.get('auth');

  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    auth.recentlyAuthenticatedAt ??= new Date();
    requireRecentAuth(auth, { withinSeconds: 15 * 60 });
  } catch (error) {
    return c.json({ error: 'forbidden', message: 'Recent authentication required' }, 403);
  }

  const { userId } = auth;
  const ipAddress = extractIp(c) ?? null;
  const userAgent = c.req.header('user-agent') ?? null;
  const requestId = c.get('requestId') ?? null;

  await prisma.$transaction(async (tx) => {
    const sessions = await tx.session.findMany({
      where: {
        userId,
        revokedAt: null,
      },
      select: { id: true },
    });

    for (const session of sessions) {
      await revokeSessionForUser({
        sessionId: session.id,
        userId,
        revokedBy: userId,
        reason: 'user_bulk_logout',
        ipAddress,
        userAgent,
        requestId,
        client: tx,
      });
    }
  });

  clearRefreshTokenCookie(c);
  return c.body(null, 204);
}

export async function bulkRevokeTokens(c: Context<AppBindings>) {
  const auth = c.get('auth');

  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    auth.recentlyAuthenticatedAt ??= new Date();
    requireRecentAuth(auth, { withinSeconds: 15 * 60 });
  } catch (error) {
    return c.json({ error: 'forbidden', message: 'Recent authentication required' }, 403);
  }

  const requestId = c.get('requestId');
  const ip = extractIp(c);
  const userAgent = c.req.header('user-agent') ?? undefined;

  const requestContext: {
    ip?: string;
    userAgent?: string;
    requestId?: string;
  } = {};

  if (ip) {
    requestContext.ip = ip;
  }
  if (userAgent) {
    requestContext.userAgent = userAgent;
  }
  if (requestId) {
    requestContext.requestId = requestId;
  }

  const tokens = await prisma.token.findMany({
    where: {
      userId: auth.userId,
      type: 'personal_access',
      revokedAt: null,
    },
    select: { id: true },
  });

  for (const token of tokens) {
    await revokePersonalAccessToken({
      tokenId: token.id,
      userId: auth.userId,
      requestContext,
    });
  }

  return c.body(null, 204);
}

function extractIp(c: Context<AppBindings>): string | undefined {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const [first] = forwarded.split(',');
    if (first?.trim()) {
      return first.trim();
    }
  }
  const realIp = c.req.header('x-real-ip');
  return realIp ?? undefined;
}

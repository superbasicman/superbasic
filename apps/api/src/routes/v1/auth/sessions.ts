import type { Context } from 'hono';
import { prisma } from '@repo/database';
import { revokeSessionForUser } from '../../../lib/session-revocation.js';
import type { AppBindings } from '../../../types/context.js';
import { clearRefreshTokenCookie } from './refresh-cookie.js';
import { requireRecentAuth } from '@repo/auth-core';

export async function listSessions(c: Context<AppBindings>) {
  const auth = c.get('auth');

  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const now = new Date();
  const sessions = await prisma.authSession.findMany({
    where: {
      userId: auth.userId,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: [
      { lastActivityAt: 'desc' },
      { createdAt: 'desc' },
    ],
    select: {
      id: true,
      createdAt: true,
      lastActivityAt: true,
      expiresAt: true,
      ipAddress: true,
      clientInfo: true,
      mfaLevel: true,
    },
  });

  return c.json({
    sessions: sessions.map((session) => ({
      ...session,
      isCurrent: auth.sessionId === session.id,
    })),
  });
}

export async function deleteSession(c: Context<AppBindings>) {
  const auth = c.get('auth');

  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    auth.recentlyAuthenticatedAt ??= new Date();
    requireRecentAuth(auth, { withinSeconds: 15 * 60, minMfaLevel: 'mfa' });
  } catch (error) {
    return c.json({ error: 'forbidden', message: 'Recent authentication required' }, 403);
  }

  const sessionId = c.req.param('id');

  if (!sessionId) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const ipAddress = extractIp(c) ?? null;
  const userAgent = c.req.header('user-agent') ?? null;
  const requestId = c.get('requestId') ?? null;

  const result = await revokeSessionForUser({
    sessionId,
    userId: auth.userId,
    revokedBy: auth.userId,
    reason: 'user_session_revoked',
    ipAddress,
    userAgent,
    requestId,
  });

  if (result.status === 'not_found') {
    return c.json({ error: 'Session not found' }, 404);
  }

  if (auth.sessionId === sessionId) {
    clearRefreshTokenCookie(c);
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

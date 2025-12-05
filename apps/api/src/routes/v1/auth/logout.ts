import type { Context } from 'hono';
import { authEvents } from '@repo/auth';
import { revokeSessionForUser } from '../../../lib/session-revocation.js';
import type { AppBindings } from '../../../types/context.js';
import {
  clearRefreshTokenCookie,
} from './refresh-cookie.js';

export async function logout(c: Context<AppBindings>) {
  const auth = c.get('auth');

  if (!auth || !auth.sessionId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // If a refresh cookie is present, require the CSRF double-submit header.
  // CSRF check removed in favor of SameSite=Lax/Strict

  const ipAddress = extractIp(c) ?? null;
  const userAgent = c.req.header('user-agent') ?? null;
  const requestId = c.get('requestId') ?? null;

  const result = await revokeSessionForUser({
    sessionId: auth.sessionId,
    userId: auth.userId,
    revokedBy: auth.userId,
    reason: 'user_logout',
    ipAddress,
    userAgent,
    requestId,
  });

  if (result.status === 'not_found') {
    return c.json({ error: 'Session not found' }, 404);
  }

  clearRefreshTokenCookie(c);

  await authEvents.emit({
    type: 'user.logout',
    userId: auth.userId,
    ...(result.session.email ? { email: result.session.email } : {}),
    metadata: {
      sessionId: auth.sessionId,
      ip: ipAddress ?? null,
      userAgent,
      requestId,
      timestamp: new Date().toISOString(),
    },
  });

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

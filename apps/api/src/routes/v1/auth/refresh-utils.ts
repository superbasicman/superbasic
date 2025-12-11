import { authEvents } from '@repo/auth-core';
import { clearRefreshTokenCookie } from './refresh-cookie.js';
import type { Context } from 'hono';
import type { AppBindings } from '../../../types/context.js';
import { refreshTokenRepository, sessionRepository } from '../../../services/index.js';

export const DEFAULT_INACTIVITY_WINDOW_SECONDS = 14 * 24 * 60 * 60;

export function invalidGrant(c: Context<AppBindings>) {
  clearRefreshTokenCookie(c);
  return c.json(
    {
      error: 'invalid_grant',
      message: 'Refresh token is invalid or expired.',
    },
    401
  );
}

export function extractIp(c: Context<AppBindings>): string | undefined {
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

export async function updateSessionTimestamps(sessionId: string, now: Date) {
  const candidateExpiresAt = new Date(now.getTime() + DEFAULT_INACTIVITY_WINDOW_SECONDS * 1000);

  const updated = await sessionRepository.updateActivityAndExpiry(sessionId, {
    lastActivityAt: now,
    expiresAt: candidateExpiresAt,
  });

  return updated ?? { expiresAt: candidateExpiresAt };
}

export type ReuseContext = {
  tokenId: string;
  sessionId: string | null;
  familyId: string | null;
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

export async function handleRevokedTokenReuse(context: ReuseContext, now: Date) {
  if (!context.sessionId || !context.familyId) {
    return;
  }
  const sessionId = context.sessionId;
  const familyId = context.familyId;

  const activeSibling = await refreshTokenRepository.findActiveSiblingForFamily(familyId);

  if (!activeSibling) {
    return;
  }

  await refreshTokenRepository.revokeFamilyAndSession(familyId, sessionId, now);

  console.warn('[auth-refresh] Detected refresh token reuse', {
    familyId,
    sessionId,
  });

  const metadataBase = {
    sessionId,
    tokenId: context.tokenId,
    familyId,
    ip: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
    requestId: context.requestId ?? null,
    timestamp: new Date().toISOString(),
  };

  await authEvents.emit({
    type: 'refresh.reuse_detected',
    userId: context.userId,
    metadata: metadataBase,
  });

  await authEvents.emit({
    type: 'session.revoked',
    userId: context.userId,
    metadata: {
      sessionId,
      reason: 'refresh_token_reuse',
      revokedBy: 'system',
      ip: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      requestId: context.requestId ?? null,
      timestamp: metadataBase.timestamp,
    },
  });
}

import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { parseOpaqueToken, verifyTokenSecret, SESSION_MAX_AGE_SECONDS, authEvents } from '@repo/auth';
import type { Context } from 'hono';
import type { AppBindings } from '../../../types/context.js';
import { prisma } from '@repo/database';
import type { TokenHashEnvelope } from '@repo/auth';
import { refreshTokenService } from '../../../lib/refresh-token-service.js';
import { generateAccessToken } from '@repo/auth-core';
import {
  getRefreshTokenFromCookie,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  validateRefreshCsrf,
} from './refresh-cookie.js';

const RefreshRequestSchema = z.object({
  refreshToken: z.string().optional(),
});

type RefreshRequest = z.infer<typeof RefreshRequestSchema>;
type RefinedRequest = {
  valid: (type: 'json') => RefreshRequest;
};

const DEFAULT_INACTIVITY_WINDOW_SECONDS = 7 * 24 * 60 * 60;

export const refreshTokenValidator = zValidator('json', RefreshRequestSchema, (result, c) => {
  if (!result.success) {
    const issues =
      'error' in result && result.error ? result.error.issues : [{ message: 'Invalid payload' }];
    return c.json(
      {
        error: 'invalid_request',
        message: 'Request payload is invalid',
        issues,
      },
      400
    );
  }
});

export async function refreshTokens(c: Context<AppBindings>) {
  const payload = (c.req as typeof c.req & RefinedRequest).valid('json');
  const presentedToken = payload.refreshToken ?? getRefreshTokenFromCookie(c);

  if (!presentedToken) {
    return invalidGrant(c);
  }

  // If the refresh token came from a cookie, require double-submit CSRF header.
  if (!payload.refreshToken) {
    const csrfOk = validateRefreshCsrf(c);
    if (!csrfOk) {
      return c.json({ error: 'invalid_csrf', message: 'CSRF token missing or invalid.' }, 403);
    }
  }

  const parsed = parseOpaqueToken(presentedToken);

  if (!parsed) {
    return invalidGrant(c);
  }

  const tokenRecord = await prisma.token.findUnique({
    where: { id: parsed.tokenId },
    include: {
      session: {
        include: {
          user: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!tokenRecord || tokenRecord.type !== 'refresh') {
    return invalidGrant(c);
  }

  const hashEnvelope = tokenRecord.tokenHash as TokenHashEnvelope | null;
  if (!hashEnvelope || !verifyTokenSecret(parsed.tokenSecret, hashEnvelope)) {
    return invalidGrant(c);
  }

  const now = new Date();

  const ipAddress = extractIp(c) ?? null;
  const userAgent = c.req.header('user-agent') ?? null;
  const requestId = c.get('requestId') ?? null;

  if (tokenRecord.revokedAt) {
    await handleRevokedTokenReuse(
      {
        tokenId: tokenRecord.id,
        sessionId: tokenRecord.sessionId,
        familyId: tokenRecord.familyId,
        userId: tokenRecord.userId,
        ipAddress,
        userAgent,
        requestId,
      },
      now
    );
    return invalidGrant(c);
  }

  if (!tokenRecord.expiresAt || tokenRecord.expiresAt <= now) {
    return invalidGrant(c);
  }

  const session = tokenRecord.session;

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    (session.absoluteExpiresAt && session.absoluteExpiresAt <= now)
  ) {
    return invalidGrant(c);
  }

  if (!session.user || session.user.status !== 'active') {
    return invalidGrant(c);
  }

  const sessionUpdate = await updateSessionTimestamps(session.id, session.kind, session.absoluteExpiresAt, now);

  await prisma.token.update({
    where: { id: tokenRecord.id },
    data: {
      revokedAt: now,
      lastUsedAt: now,
    },
  });

  const rotated = await refreshTokenService.issueRefreshToken({
    userId: tokenRecord.userId,
    sessionId: session.id,
    expiresAt: sessionUpdate.expiresAt,
    familyId: tokenRecord.familyId ?? null,
    metadata: {
      source: 'auth-refresh-endpoint',
      ipAddress: ipAddress ?? null,
      userAgent,
    },
  });

  const { token: accessToken, claims } = await generateAccessToken({
    userId: tokenRecord.userId,
    sessionId: session.id,
    clientType: session.clientType,
  });

  setRefreshTokenCookie(c, rotated.refreshToken, rotated.token.expiresAt);

  return c.json({
    tokenType: 'Bearer',
    accessToken,
    refreshToken: rotated.refreshToken,
    expiresIn: claims.exp - claims.iat,
  });
}

async function updateSessionTimestamps(
  sessionId: string,
  kind: string | null,
  absoluteExpiresAt: Date | null,
  now: Date
) {
  const inactivityWindowSeconds =
    kind === 'persistent' ? SESSION_MAX_AGE_SECONDS : DEFAULT_INACTIVITY_WINDOW_SECONDS;
  const candidateExpiresAt = new Date(now.getTime() + inactivityWindowSeconds * 1000);
  const cappedExpiresAt =
    absoluteExpiresAt && candidateExpiresAt > absoluteExpiresAt ? absoluteExpiresAt : candidateExpiresAt;

  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: {
      lastUsedAt: now,
      expiresAt: cappedExpiresAt,
    },
    select: {
      expiresAt: true,
    },
  });

  return updated;
}

type ReuseContext = {
  tokenId: string;
  sessionId: string | null;
  familyId: string | null;
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

async function handleRevokedTokenReuse(context: ReuseContext, now: Date) {
  if (!context.sessionId || !context.familyId) {
    return;
  }
  const sessionId = context.sessionId;
  const familyId = context.familyId;

  const activeSibling = await prisma.token.findFirst({
    where: {
      familyId,
      type: 'refresh',
      revokedAt: null,
    },
  });

  if (!activeSibling) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.token.updateMany({
      where: { familyId },
      data: { revokedAt: now },
    });

    await tx.session.update({
      where: { id: sessionId },
      data: { revokedAt: now },
    });
  });

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

function invalidGrant(c: Context<AppBindings>) {
  clearRefreshTokenCookie(c);
  return c.json(
    {
      error: 'invalid_grant',
      message: 'Refresh token is invalid or expired.',
    },
    401
  );
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

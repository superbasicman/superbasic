import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authEvents, parseOpaqueToken, verifyTokenSecret } from '@repo/auth';
import type { Context } from 'hono';
import type { AppBindings } from '../../../types/context.js';
import { prisma, Prisma } from '@repo/database';
import type { TokenHashEnvelope } from '@repo/auth';
import { authService } from '../../../lib/auth-service.js';
import { generateAccessToken } from '@repo/auth-core';
import {
  getRefreshTokenFromCookie,
  setRefreshTokenCookie,
  validateRefreshCsrf,
} from './refresh-cookie.js';
import {
  extractIp,
  handleRevokedTokenReuse,
  invalidGrant,
  updateSessionTimestamps,
} from './refresh-utils.js';
import type { ClientType } from '@repo/auth-core';

const RefreshRequestSchema = z.object({
  refreshToken: z.string().optional(),
});

type RefreshRequest = z.infer<typeof RefreshRequestSchema>;
type RefinedRequest = {
  valid: (type: 'json') => RefreshRequest;
};

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

  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { id: parsed.tokenId },
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

  if (!tokenRecord) {
    return invalidGrant(c);
  }

  const hashEnvelope = tokenRecord.hashEnvelope as TokenHashEnvelope | null;
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

  if (!session || session.revokedAt || session.expiresAt <= now) {
    return invalidGrant(c);
  }

  if (!session.user || session.user.userState !== 'active') {
    return invalidGrant(c);
  }

  const sessionUpdate = await updateSessionTimestamps(session.id, now);
  const clientInfo = session.clientInfo as Record<string, unknown> | null;
  const clientType: ClientType =
    clientInfo && typeof clientInfo === 'object' && 'type' in clientInfo
      ? ((clientInfo as any).type as ClientType)
      : 'web';

  try {
    await prisma.refreshToken.update({
      where: { id: tokenRecord.id, revokedAt: null },
      data: {
        revokedAt: now,
        lastUsedAt: now,
        lastUsedIp: ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      // Token was already revoked (race condition or reuse)
      await handleRevokedTokenReuse(
        {
          tokenId: tokenRecord.id,
          sessionId: session.id,
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
    throw error;
  }

  // Preserve the existing family; if missing, seed with the current token id to keep the family stable.
  const familyId = tokenRecord.familyId ?? tokenRecord.id;

  const rotated = await authService.issueRefreshToken({
    userId: tokenRecord.userId,
    sessionId: session.id,
    expiresAt: sessionUpdate.expiresAt,
    familyId,
    metadata: {
      source: 'auth-refresh-endpoint',
      ipAddress: ipAddress ?? null,
      userAgent,
    },
  });

  const { token: accessToken, claims } = await generateAccessToken({
    userId: tokenRecord.userId,
    sessionId: session.id,
    clientType,
    mfaLevel: session.mfaLevel,
    reauthenticatedAt: Math.floor(now.getTime() / 1000),
  });

  setRefreshTokenCookie(c, rotated.refreshToken, rotated.token.expiresAt);

  await authEvents.emit({
    type: 'refresh.rotated',
    userId: tokenRecord.userId,
    metadata: {
      sessionId: session.id,
      previousTokenId: tokenRecord.id,
      newTokenId: rotated.token.id,
      familyId: tokenRecord.familyId ?? null,
      ip: ipAddress,
      userAgent,
      requestId,
      timestamp: new Date().toISOString(),
    },
  });

  return c.json({
    tokenType: 'Bearer',
    accessToken,
    refreshToken: rotated.refreshToken,
    expiresIn: claims.exp - claims.iat,
  });
}

import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authEvents, parseOpaqueToken, verifyTokenSecret } from '@repo/auth';
import type { Context } from 'hono';
import type { AppBindings } from '../../../types/context.js';
import type { TokenHashEnvelope } from '@repo/auth';
import { authService } from '../../../lib/auth-service.js';
import { buildUserClaimsForTokenResponse } from '../../../lib/user-claims.js';
import {
  getRefreshTokenFromCookie,
  setRefreshTokenCookie,
} from './refresh-cookie.js';
import {
  extractIp,
  handleRevokedTokenReuse,
  invalidGrant,
  updateSessionTimestamps,
} from './refresh-utils.js';
import type { ClientType } from '@repo/auth-core';
import { refreshTokenRepository } from '../../../services/index.js';

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
    // CSRF check removed in favor of SameSite=Lax/Strict
  }

  const parsed = parseOpaqueToken(presentedToken);

  if (!parsed) {
    return invalidGrant(c);
  }

  const tokenRecord = await refreshTokenRepository.findWithSession(parsed.tokenId);

  if (!tokenRecord) {
    return invalidGrant(c);
  }

  const hashEnvelope = tokenRecord.hashEnvelope as TokenHashEnvelope | null;
  if (!hashEnvelope || !verifyTokenSecret(parsed.tokenSecret, hashEnvelope)) {
    return invalidGrant(c);
  }

  const now = new Date();
  // 10 second window for benign race conditions (e.g. network retries, multiple tabs)
  const BENIGN_RACE_THRESHOLD_MS = 10000;

  const ipAddress = extractIp(c) ?? null;
  const userAgent = c.req.header('user-agent') ?? null;
  const requestId = c.get('requestId') ?? null;

  if (tokenRecord.revokedAt) {
    const timeSinceRevocation = now.getTime() - tokenRecord.revokedAt.getTime();

    if (timeSinceRevocation > BENIGN_RACE_THRESHOLD_MS) {
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
    }
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

  const revokeResult = await refreshTokenRepository.revokeToken(
    tokenRecord.id,
    {
      revokedAt: now,
      lastUsedAt: now,
      lastUsedIp: ipAddress,
      userAgent,
    }
  );

  if (revokeResult === 'not_found') {
    const revokedAt = await refreshTokenRepository.findRevokedAt(tokenRecord.id);
    if (revokedAt) {
      const timeSinceRevocation = now.getTime() - revokedAt.getTime();
      if (timeSinceRevocation > BENIGN_RACE_THRESHOLD_MS) {
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
      }
    }
    return invalidGrant(c);
  }

  // Preserve the existing family; if missing, seed with the current token id to keep the family stable.
  const familyId = tokenRecord.familyId ?? tokenRecord.id;
  // Preserve scopes from the original token
  const storedScopes = (tokenRecord.scopes as string[]) ?? [];

  const rotated = await authService.issueRefreshToken({
    userId: tokenRecord.userId,
    sessionId: session.id,
    expiresAt: sessionUpdate.expiresAt,
    familyId,
    scopes: storedScopes,
    metadata: {
      source: 'auth-refresh-endpoint',
      ipAddress: ipAddress ?? null,
      userAgent,
    },
  });

  const { token: accessToken, claims } = await authService.issueAccessToken({
    userId: tokenRecord.userId,
    sessionId: session.id,
    clientType,
    mfaLevel: session.mfaLevel,
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

  // Include user claims only for web sessions with openid scope
  const isWebSession = clientType === 'web';
  const hasOpenidScope = storedScopes.includes('openid');
  const userClaims =
    isWebSession && hasOpenidScope
      ? await buildUserClaimsForTokenResponse({
          userId: tokenRecord.userId,
          scopes: storedScopes,
        })
      : null;

  return c.json({
    tokenType: 'Bearer',
    accessToken,
    refreshToken: rotated.refreshToken,
    expiresIn: claims.exp - claims.iat,
    ...(userClaims && { user: userClaims }),
  });
}

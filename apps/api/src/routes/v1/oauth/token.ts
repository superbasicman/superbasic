import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { AuthorizationError, normalizeRedirectUri, requireOAuthClient, validatePkcePair } from '@repo/auth-core';
import { parseOpaqueToken } from '@repo/auth';
import { Hono } from 'hono';
import { authService } from '../../../lib/auth-service.js';
import { consumeAuthorizationCode } from '../../../lib/oauth-authorization-codes.js';
import type { AppBindings } from '../../../types/context.js';
import { generateAccessToken } from '@repo/auth-core';
import { prisma } from '@repo/database';

const tokenSchema = z.object({
  grant_type: z.literal('authorization_code'),
  code: z.string().min(1),
  redirect_uri: z.string().min(1),
  client_id: z.string().min(1),
  code_verifier: z.string().min(1),
});

const tokenRoute = new Hono<AppBindings>();

tokenRoute.post(
  '/token',
  zValidator('form', tokenSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: 'invalid_request', message: 'Invalid request parameters', issues: 'error' in result ? result.error.issues : [] },
        400
      );
    }
  }),
  async (c) => {
    const body = c.req.valid('form');

    try {
      const parsedCode = parseOpaqueToken(body.code);
      if (!parsedCode) {
        return c.json({ error: 'invalid_grant', message: 'Authorization code is invalid' }, 400);
      }

      const redirectUri = normalizeRedirectUri(body.redirect_uri);
      const client = await requireOAuthClient({ prisma, clientId: body.client_id, redirectUri });

      const codeRecord = await consumeAuthorizationCode({
        codeId: parsedCode.tokenId,
        codeSecret: parsedCode.tokenSecret,
      });

      if (codeRecord.clientId !== client.clientId) {
        throw new AuthorizationError('Invalid client_id for this authorization code');
      }

      if (normalizeRedirectUri(codeRecord.redirectUri) !== redirectUri) {
        throw new AuthorizationError('redirect_uri does not match authorization request');
      }

      validatePkcePair({
        codeVerifier: body.code_verifier,
        codeChallenge: codeRecord.codeChallenge,
        codeChallengeMethod: codeRecord.codeChallengeMethod,
      });

      const ipAddress = extractIp(c);
      const userAgentHeader = c.req.header('user-agent');
      const clientType = client.clientId === 'mobile' ? 'mobile' : 'other';

      const { session: sessionHandle, refresh: refreshResult } = await authService.createSessionWithRefresh({
        userId: codeRecord.userId,
        identity: {
          provider: 'oauth:code',
          providerUserId: codeRecord.userId,
          email: null,
        },
        clientType,
        ...(ipAddress ? { ipAddress } : {}),
        ...(userAgentHeader ? { userAgent: userAgentHeader } : {}),
        mfaLevel: 'none',
        refreshMetadata: {
          clientType,
          ipAddress: ipAddress ?? null,
          userAgent: userAgentHeader ?? null,
          source: 'oauth-token-endpoint',
        },
      });

      const { token: accessToken, claims } = await generateAccessToken({
        userId: sessionHandle.userId,
        sessionId: sessionHandle.sessionId,
        clientType: sessionHandle.clientType,
        mfaLevel: sessionHandle.mfaLevel,
        reauthenticatedAt: Math.floor(Date.now() / 1000),
      });

      return c.json({
        tokenType: 'Bearer',
        accessToken: accessToken ?? null,
        refreshToken: refreshResult.refreshToken,
        expiresIn: claims ? claims.exp - claims.iat : undefined,
      });
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return c.json({ error: 'invalid_grant', message: error.message }, 400);
      }
      console.error('[oauth/token] Failed to exchange authorization code', error);
      return c.json(
        { error: 'server_error', message: 'Unable to exchange authorization code' },
        500
      );
    }
  }
);

function extractIp(c: any): string | undefined {
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

export { tokenRoute };

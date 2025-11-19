import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { COOKIE_NAME } from '@repo/auth';
import { authService } from '../../../lib/auth-service.js';
import { refreshTokenService } from '../../../lib/refresh-token-service.js';
import { loadLegacyAuthSession } from '../../../lib/authjs-session.js';
import { generateAccessToken } from '@repo/auth-core';
import type { AppBindings } from '../../../types/context.js';
import { setRefreshTokenCookie } from './refresh-cookie.js';

const CLIENT_TYPES = ['web', 'mobile', 'cli', 'partner', 'other'] as const;

const AuthTokenRequestSchema = z.object({
  sessionToken: z.string().optional(),
  clientType: z.enum(CLIENT_TYPES).optional(),
  rememberMe: z.boolean().optional(),
});

type AuthTokenRequest = z.infer<typeof AuthTokenRequestSchema>;
type ValidatedJsonRequest = {
  valid: (type: 'json') => AuthTokenRequest;
};

export const authTokenValidator = zValidator('json', AuthTokenRequestSchema, (result, c) => {
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

export async function exchangeAuthTokens(c: Context<AppBindings>) {
  const payload = (c.req as typeof c.req & ValidatedJsonRequest).valid('json');
  const sessionToken = payload.sessionToken ?? getCookie(c, COOKIE_NAME);

  if (!sessionToken) {
    return c.json(
      { error: 'invalid_grant', message: 'Session token is required to exchange for API tokens.' },
      401
    );
  }

  const legacy = await loadLegacyAuthSession(sessionToken);
  if (!legacy) {
    return c.json(
      { error: 'invalid_grant', message: 'Session token is invalid or expired.' },
      401
    );
  }

  try {
    const ipAddress = extractIp(c);
    const userAgentHeader = c.req.header('user-agent');

    const sessionHandle = await authService.createSession({
      userId: legacy.user.id,
      identity: {
        provider: 'authjs:session',
        providerUserId: legacy.user.id,
        email: legacy.user.email,
        emailVerified: true,
      },
      clientType: payload.clientType ?? 'web',
      ...(ipAddress ? { ipAddress } : {}),
      ...(userAgentHeader ? { userAgent: userAgentHeader } : {}),
      mfaLevel: (legacy.session.mfaLevel as 'none' | 'mfa' | 'phishing_resistant' | undefined) ?? 'none',
      rememberMe: payload.rememberMe ?? false,
    });

    const { token: accessToken, claims } = await generateAccessToken({
      userId: sessionHandle.userId,
      sessionId: sessionHandle.sessionId,
      clientType: sessionHandle.clientType,
    });

    const refreshResult = await refreshTokenService.issueRefreshToken({
      userId: sessionHandle.userId,
      sessionId: sessionHandle.sessionId,
      expiresAt: sessionHandle.expiresAt,
      metadata: {
        clientType: sessionHandle.clientType,
        ipAddress: ipAddress ?? null,
        userAgent: userAgentHeader ?? null,
        source: 'auth-token-endpoint',
      },
    });

    setRefreshTokenCookie(c, refreshResult.refreshToken, refreshResult.token.expiresAt);

    return c.json({
      tokenType: 'Bearer',
      accessToken,
      refreshToken: refreshResult.refreshToken,
      expiresIn: claims.exp - claims.iat,
    });
  } catch (error) {
    console.error('[auth-token] Failed to exchange session for tokens', error);
    return c.json({ error: 'invalid_grant', message: 'Unable to issue tokens for this session.' }, 401);
  }
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

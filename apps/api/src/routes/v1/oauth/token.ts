import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { setCookie } from 'hono/cookie';
import { prisma } from '@repo/database';
import { requireOAuthClient, AuthorizationError, validatePkcePair, generateAccessToken } from '@repo/auth-core';
import { parseOpaqueToken, verifyTokenSecret } from '@repo/auth';
import { authService } from '../../../lib/auth-service.js';

const token = new Hono();

const tokenSchema = z.object({
  grant_type: z.literal('authorization_code'),
  client_id: z.string(),
  code: z.string(),
  redirect_uri: z.string().url(),
  code_verifier: z.string(),
});

token.post('/', zValidator('form', tokenSchema), async (c) => {
  const {
    client_id,
    code,
    redirect_uri,
    code_verifier,
  } = c.req.valid('form');

  try {
    // 1. Validate client
    await requireOAuthClient({
      prisma,
      clientId: client_id,
      redirectUri: redirect_uri,
    });

    // 2. Parse and verify the authorization code
    const parsed = parseOpaqueToken(code);
    if (!parsed) {
      throw new AuthorizationError('Invalid authorization code format');
    }

    // 3. Find the authorization code in the database
    const authCode = await prisma.oAuthAuthorizationCode.findFirst({
      where: {
        clientId: client_id,
        redirectUri: redirect_uri,
        expiresAt: { gt: new Date() },
        consumedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!authCode) {
      throw new AuthorizationError('Authorization code not found or expired');
    }

    // 4. Verify the code hash
    const isValid = await verifyTokenSecret(parsed.tokenSecret, authCode.codeHash);
    if (!isValid) {
      throw new AuthorizationError('Invalid authorization code');
    }

    // 5. Verify PKCE
    validatePkcePair({
      codeVerifier: code_verifier,
      codeChallenge: authCode.codeChallenge,
      codeChallengeMethod: authCode.codeChallengeMethod,
    });

    // 6. Mark code as consumed
    await prisma.oAuthAuthorizationCode.update({
      where: { id: authCode.id },
      data: { consumedAt: new Date() },
    });

    // 7. Create session and get access token
    const result = await authService.createSessionWithRefresh({
      userId: authCode.userId,
      identity: {
        provider: 'oauth',
        providerUserId: client_id,
        email: null,
      },
      clientType: 'web',
      workspaceId: null,
      rememberMe: true,
    });

    // 8. Generate access token
    const accessToken = await generateAccessToken({
      userId: result.session.userId,
      sessionId: result.session.sessionId,
      clientType: result.session.clientType,
      workspaceId: result.session.activeWorkspaceId ?? null,
    });

    // 9. Set session cookie
    setCookie(c, 'authjs.session-token', result.session.sessionId, {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60, // 30 days
      sameSite: 'Lax',
    });

    // 10. Return tokens
    return c.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 600, // 10 minutes
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token exchange failed';
    return c.json({ error: 'invalid_grant', error_description: message }, 400);
  }
});

export { token };

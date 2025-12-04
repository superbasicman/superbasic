import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getCookie } from 'hono/cookie';
import { prisma } from '@repo/database';
import { normalizeRedirectUri, requireOAuthClient, AuthorizationError } from '@repo/auth-core';
import { createOpaqueToken, createTokenHashEnvelope, COOKIE_NAME } from '@repo/auth';

const authorize = new Hono();

const authorizeSchema = z.object({
  client_id: z.string(),
  redirect_uri: z.string().url(),
  response_type: z.literal('code'),
  state: z.string().optional(),
  code_challenge: z.string(),
  code_challenge_method: z.enum(['S256', 'plain']).optional().default('S256'),
  scope: z.string().optional(),
  nonce: z.string().optional(),
});

const WEB_APP_URL = process.env.WEB_APP_URL || 'http://localhost:5173';

authorize.get('/', zValidator('query', authorizeSchema), async (c) => {
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope, nonce } =
    c.req.valid('query');

  try {
    // 1. Validate Client & Redirect URI
    await requireOAuthClient({
      prisma,
      clientId: client_id,
      redirectUri: redirect_uri,
    });
  } catch (error) {
    const errorUrl = new URL(redirect_uri);
    const description =
      error instanceof AuthorizationError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Unknown error';
    errorUrl.searchParams.set('error', 'invalid_request');
    errorUrl.searchParams.set('error_description', description);
    if (state) {
      errorUrl.searchParams.set('state', state);
    }
    return c.redirect(errorUrl.toString());
  }

  // 2. Check for existing session
  const sessionToken = getCookie(c, COOKIE_NAME);

  // Validate session token is a valid UUID before querying
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!sessionToken || !UUID_REGEX.test(sessionToken)) {
    // No session or invalid format - redirect to login
    const loginUrl = new URL('/login', WEB_APP_URL);
    loginUrl.searchParams.set('returnTo', c.req.url);
    return c.redirect(loginUrl.toString());
  }

  // 3. Look up session to get userId
  const session = await prisma.authSession.findFirst({
    where: {
      id: sessionToken,
      expiresAt: { gt: new Date() },
      revokedAt: null,
    },
    select: {
      userId: true,
    },
  });

  if (!session) {
    // Invalid session - redirect to login
    const loginUrl = new URL('/login', WEB_APP_URL);
    loginUrl.searchParams.set('returnTo', c.req.url);
    return c.redirect(loginUrl.toString());
  }

  // 4. Generate Authorization Code
  const opaque = createOpaqueToken();
  const codeHash = createTokenHashEnvelope(opaque.tokenSecret);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await prisma.oAuthAuthorizationCode.create({
    data: {
      id: opaque.tokenId,
      userId: session.userId,
      clientId: client_id,
      redirectUri: normalizeRedirectUri(redirect_uri),
      codeHash,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
      scopes: scope ? scope.split(' ') : [],
      nonce: nonce ?? null,
      expiresAt,
    },
  });

  // 5. Redirect back to client with code
  const callbackUrl = new URL(redirect_uri);
  callbackUrl.searchParams.set('code', opaque.value);
  if (state) {
    callbackUrl.searchParams.set('state', state);
  }

  return c.redirect(callbackUrl.toString());
});

export { authorize };

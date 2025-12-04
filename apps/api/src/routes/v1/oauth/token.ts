import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { setCookie } from 'hono/cookie';
import { Prisma, prisma } from '@repo/database';
import {
  requireOAuthClient,
  AuthorizationError,
  validatePkcePair,
  generateAccessToken,
} from '@repo/auth-core';
import type { ClientType } from '@repo/auth-core';
import { parseOpaqueToken, verifyTokenSecret, COOKIE_NAME } from '@repo/auth';
import type { TokenHashEnvelope } from '@repo/auth';
import { authService } from '../../../lib/auth-service.js';
import type { AppBindings } from '../../../types/context.js';
import {
  extractIp,
  handleRevokedTokenReuse,
  invalidGrant,
  updateSessionTimestamps,
} from '../auth/refresh-utils.js';
import {
  setRefreshTokenCookie,
} from '../auth/refresh-cookie.js';

const token = new Hono<AppBindings>();

const tokenSchema = z.discriminatedUnion('grant_type', [
  z.object({
    grant_type: z.literal('authorization_code'),
    client_id: z.string(),
    code: z.string(),
    redirect_uri: z.string().url(),
    // Optional for external provider flows (Google, magic link)
    code_verifier: z.string().optional(),
  }),
  z.object({
    grant_type: z.literal('refresh_token'),
    client_id: z.string(),
    refresh_token: z.string(),
  }),
  z.object({
    grant_type: z.literal('client_credentials'),
    client_id: z.string(),
    client_secret: z.string(),
    scope: z.string().optional(),
    workspace_id: z.string().uuid().optional(),
  }),
]);

token.post('/', zValidator('form', tokenSchema), async (c) => {
  const body = c.req.valid('form');

  try {
    if (body.grant_type === 'client_credentials') {
      const { client_id, client_secret, scope, workspace_id } = body;
      const serviceIdentity = await prisma.serviceIdentity.findUnique({
        where: { clientId: client_id },
        include: {
          clientSecrets: {
            where: {
              revokedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!serviceIdentity || serviceIdentity.disabledAt) {
        throw new AuthorizationError('Invalid client credentials');
      }

      const [clientSecretRecord] = serviceIdentity.clientSecrets;
      if (!clientSecretRecord) {
        throw new AuthorizationError('Invalid client credentials');
      }

      const hashEnvelope = clientSecretRecord.secretHash as TokenHashEnvelope | null;
      if (!hashEnvelope || !verifyTokenSecret(client_secret, hashEnvelope)) {
        throw new AuthorizationError('Invalid client credentials');
      }

      const allowedWorkspaces = Array.isArray(serviceIdentity.allowedWorkspaces)
        ? (serviceIdentity.allowedWorkspaces as string[]).filter(
            (id): id is string => typeof id === 'string' && id.length > 0
          )
        : [];
      const selectedWorkspace =
        workspace_id ??
        (allowedWorkspaces.length === 1 ? allowedWorkspaces[0] : undefined);

      if (!selectedWorkspace && allowedWorkspaces.length > 1) {
        throw new AuthorizationError('workspace_id is required for this client');
      }
      if (selectedWorkspace && allowedWorkspaces.length > 0) {
        if (!allowedWorkspaces.includes(selectedWorkspace)) {
          throw new AuthorizationError('workspace_id is not permitted for this client');
        }
      }

      const scopes = scope ? scope.split(' ').filter(Boolean) : [];
      const { token: accessToken, claims } = await generateAccessToken({
        userId: serviceIdentity.id,
        sessionId: null,
        principalType: 'service',
        clientId: client_id,
        workspaceId: selectedWorkspace ?? null,
        clientType: 'partner',
        scopes,
        allowedWorkspaces,
      });

      return c.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: claims.exp - claims.iat,
        scope: scopes.join(' '),
      });
    }

    if (body.grant_type === 'authorization_code') {
      const {
        client_id,
        code,
        redirect_uri,
        code_verifier,
      } = body;

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

      // 5. Verify PKCE (skip for external provider flows where challenge is empty)
      if (authCode.codeChallenge && code_verifier) {
        validatePkcePair({
          codeVerifier: code_verifier,
          codeChallenge: authCode.codeChallenge,
          codeChallengeMethod: authCode.codeChallengeMethod,
        });
      } else if (authCode.codeChallenge && !code_verifier) {
        // PKCE was required but verifier not provided
        throw new AuthorizationError('PKCE code_verifier is required');
      }
      // If no challenge was set (external provider flow), skip PKCE validation

      // 6. Mark code as consumed
      await prisma.oAuthAuthorizationCode.update({
        where: { id: authCode.id },
        data: { consumedAt: new Date() },
      });

      // 7. Fetch user email for identity
      const user = await prisma.user.findUnique({
        where: { id: authCode.userId },
        select: { primaryEmail: true },
      });

      // 8. Create session and get access token + refresh token
      // Use local_password as a catch-all since the actual IdP is verified at /oauth/authorize
      const result = await authService.createSessionWithRefresh({
        userId: authCode.userId,
        identity: {
          provider: 'local_password',
          providerUserId: authCode.userId,
          email: user?.primaryEmail ?? null,
        },
        clientType: client_id === 'mobile' ? 'mobile' : 'web',
        workspaceId: null,
        rememberMe: true,
      });

      const { token: accessToken, claims } = await generateAccessToken({
        userId: result.session.userId,
        sessionId: result.session.sessionId,
        clientType: result.session.clientType,
        workspaceId: result.session.activeWorkspaceId ?? null,
      });

      // Set session + refresh cookies
      setCookie(c, COOKIE_NAME, result.session.sessionId, {
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60, // 30 days
        sameSite: 'Lax',
      });

      setRefreshTokenCookie(c, result.refresh.refreshToken, result.refresh.token.expiresAt);

      return c.json({
        access_token: accessToken,
        refresh_token: result.refresh.refreshToken,
        token_type: 'Bearer',
        expires_in: claims.exp - claims.iat,
      });
    }

    // grant_type === refresh_token
    const { client_id, refresh_token } = body;

    await requireOAuthClient({
      prisma,
      clientId: client_id,
      allowDisabled: false,
    });

    const parsed = parseOpaqueToken(refresh_token);
    if (!parsed) {
      return invalidGrant(c);
    }

    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { id: parsed.tokenId },
      include: {
        session: {
          include: {
            user: {
              select: { id: true, userState: true },
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
    if (!session || session.revokedAt || session.expiresAt <= now || !session.user || session.user.userState !== 'active') {
      return invalidGrant(c);
    }

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

    const sessionUpdate = await updateSessionTimestamps(session.id, now);

    const familyId = tokenRecord.familyId ?? tokenRecord.id;
    const clientInfo = session.clientInfo as Record<string, unknown> | null;
    const clientType: ClientType =
      clientInfo && typeof clientInfo === 'object' && 'type' in clientInfo
        ? ((clientInfo as any).type as ClientType)
        : 'web';

    const rotated = await authService.issueRefreshToken({
      userId: tokenRecord.userId,
      sessionId: session.id,
      expiresAt: sessionUpdate.expiresAt,
      familyId,
      metadata: {
        source: 'oauth-token-refresh',
        ipAddress,
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

    return c.json({
      access_token: accessToken,
      refresh_token: rotated.refreshToken,
      token_type: 'Bearer',
      expires_in: claims.exp - claims.iat,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token exchange failed';
    return c.json({ error: 'invalid_grant', error_description: message }, 400);
  }
});

export { token };

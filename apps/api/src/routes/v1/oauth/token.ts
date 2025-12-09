import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { setCookie } from 'hono/cookie';
import {
  AuthorizationError,
  validatePkcePair,
  generateAccessToken,
  generateIdToken,
  extractClientSecret,
} from '@repo/auth-core';
import type { ClientType } from '@repo/auth-core';
import { parseOpaqueToken, verifyTokenSecret, COOKIE_NAME } from '@repo/auth';
import type { TokenHashEnvelope } from '@repo/auth';
import { authService } from '../../../lib/auth-service.js';
import { buildUserClaimsForTokenResponse } from '../../../lib/user-claims.js';
import type { AppBindings } from '../../../types/context.js';
import {
  authorizationCodeRepository,
  oauthClientService,
  refreshTokenRepository,
  serviceIdentityRepository,
  userRepository,
} from '../../../services/index.js';
import {
  extractIp,
  handleRevokedTokenReuse,
  invalidGrant,
  updateSessionTimestamps,
} from '../auth/refresh-utils.js';
import { setRefreshTokenCookie } from '../auth/refresh-cookie.js';

const token = new Hono<AppBindings>();

const tokenSchema = z.discriminatedUnion('grant_type', [
  z.object({
    grant_type: z.literal('authorization_code'),
    client_id: z.string(),
    code: z.string(),
    redirect_uri: z.string().url(),
    code_verifier: z.string().optional(),
    client_secret: z.string().optional(),
  }),
  z.object({
    grant_type: z.literal('refresh_token'),
    client_id: z.string(),
    refresh_token: z.string(),
    client_secret: z.string().optional(),
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
      const serviceIdentity = await serviceIdentityRepository.findActiveWithLatestSecret(client_id);

      if (!serviceIdentity) {
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
        workspace_id ?? (allowedWorkspaces.length === 1 ? allowedWorkspaces[0] : undefined);

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
      const { client_id, code, redirect_uri, code_verifier, client_secret } = body;

      // 1. Validate client
      const client = await oauthClientService.requireClient({
        clientId: client_id,
        redirectUri: redirect_uri,
      });

      // 2. Authenticate confidential clients
      const authHeader = c.req.header('Authorization');
      const extractedSecret = extractClientSecret(authHeader, client_secret);
      await oauthClientService.authenticateConfidentialClient({
        client,
        clientSecret: extractedSecret,
      });

      // 3. Parse and verify the authorization code
      const parsed = parseOpaqueToken(code);
      if (!parsed) {
        throw new AuthorizationError('Invalid authorization code format');
      }

      const authCode = await authorizationCodeRepository.consume({
        id: parsed.tokenId,
        validate: (record) => {
          if (record.clientId !== client_id || record.redirectUri !== redirect_uri) {
            return false;
          }
          const hashIsValid = verifyTokenSecret(
            parsed.tokenSecret,
            record.codeHash as TokenHashEnvelope
          );
          if (!hashIsValid) {
            return false;
          }
          if (record.codeChallenge) {
            if (!code_verifier) {
              return false;
            }
            try {
              validatePkcePair({
                codeVerifier: code_verifier,
                codeChallenge: record.codeChallenge,
                codeChallengeMethod: record.codeChallengeMethod,
              });
            } catch {
              return false;
            }
          }
          return true;
        },
      });

      if (!authCode) {
        throw new AuthorizationError('Authorization code not found or expired');
      }

      // 7. Fetch user details for identity and id_token
      const user = await userRepository.findProfileForTokenPayload(authCode.userId);

      // 8. Create session and get access token + refresh token
      // Use local_password as a catch-all since the actual IdP is verified at /oauth/authorize
      const requestedScopes = authCode.scopes as string[];
      const result = await authService.createSessionWithRefresh({
        userId: authCode.userId,
        identity: {
          provider: 'local_password',
          providerSubject: authCode.userId,
          email: user?.primaryEmail ?? null,
        },
        clientType: client_id === 'mobile' ? 'mobile' : 'web',
        workspaceId: null,
        rememberMe: true,
        refreshScopes: requestedScopes,
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

      // 9. Issue id_token if openid scope was requested
      const hasOpenidScope = requestedScopes.includes('openid');

      let idToken: string | undefined;
      if (hasOpenidScope) {
        const authTime = Math.floor(result.session.createdAt.getTime() / 1000);
        const idTokenResult = await generateIdToken({
          userId: authCode.userId,
          clientId: client_id,
          authTime,
          nonce: authCode.nonce ?? undefined,
          email: user?.primaryEmail ?? undefined,
          emailVerified: user?.emailVerified ?? undefined,
          name: user?.displayName ?? undefined,
          picture: user?.picture ?? undefined,
        });
        idToken = idTokenResult.token;
      }

      // Include user claims only for first-party clients with openid scope
      const userClaims =
        client.isFirstParty && hasOpenidScope
          ? await buildUserClaimsForTokenResponse({
              userId: authCode.userId,
              scopes: requestedScopes,
            })
          : null;

      return c.json({
        access_token: accessToken,
        refresh_token: result.refresh.refreshToken,
        token_type: 'Bearer',
        expires_in: claims.exp - claims.iat,
        ...(idToken && { id_token: idToken }),
        ...(userClaims && { user: userClaims }),
      });
    }

    // grant_type === refresh_token
    const { client_id, refresh_token, client_secret } = body;

    const client = await oauthClientService.requireClient({
      clientId: client_id,
      allowDisabled: false,
    });

    // Authenticate confidential clients
    const authHeader = c.req.header('Authorization');
    const extractedSecret = extractClientSecret(authHeader, client_secret);
    await oauthClientService.authenticateConfidentialClient({
      client,
      clientSecret: extractedSecret,
    });

    const parsed = parseOpaqueToken(refresh_token);
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
      !session.user ||
      session.user.userState !== 'active'
    ) {
      return invalidGrant(c);
    }

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

    const sessionUpdate = await updateSessionTimestamps(session.id, now);

    const familyId = tokenRecord.familyId ?? tokenRecord.id;
    const clientInfo = session.clientInfo as Record<string, unknown> | null;
    const clientType: ClientType =
      clientInfo && typeof clientInfo === 'object' && 'type' in clientInfo
        ? ((clientInfo as any).type as ClientType)
        : 'web';

    // Preserve scopes from the original token for the rotated token
    const storedScopes = (tokenRecord.scopes as string[]) ?? [];

    const rotated = await authService.issueRefreshToken({
      userId: tokenRecord.userId,
      sessionId: session.id,
      expiresAt: sessionUpdate.expiresAt,
      familyId,
      scopes: storedScopes,
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

    // Include user claims only for first-party clients with openid scope
    const hasOpenidScope = storedScopes.includes('openid');
    const userClaims =
      client.isFirstParty && hasOpenidScope
        ? await buildUserClaimsForTokenResponse({
            userId: tokenRecord.userId,
            scopes: storedScopes,
          })
        : null;

    return c.json({
      access_token: accessToken,
      refresh_token: rotated.refreshToken,
      token_type: 'Bearer',
      expires_in: claims.exp - claims.iat,
      ...(userClaims && { user: userClaims }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token exchange failed';
    return c.json({ error: 'invalid_grant', error_description: message }, 400);
  }
});

export { token };

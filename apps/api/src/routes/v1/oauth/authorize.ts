import { zValidator } from '@hono/zod-validator';
import {
  AuthorizationError,
  normalizePkceMethod,
  requireOAuthClient,
  type PermissionScope,
} from '@repo/auth-core';
import { prisma } from '@repo/database';
import { Hono } from 'hono';
import { z } from 'zod';
import { VALID_SCOPES } from '@repo/types';
import { issueAuthorizationCode } from '../../../lib/oauth-authorization-codes.js';
import type { AppBindings } from '../../../types/context.js';

const authorizeQuerySchema = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
  code_challenge: z.string().min(1),
  code_challenge_method: z.enum(['S256', 'plain']).optional(),
  scope: z.string().optional(),
  state: z.string().optional(),
});

const authorizeRoute = new Hono<AppBindings>();

authorizeRoute.get(
  '/authorize',
  zValidator('query', authorizeQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: 'invalid_request',
          message: 'Invalid request parameters',
          issues: 'error' in result ? result.error.issues : [],
        },
        400
      );
    }
  }),
  async (c) => {
    const auth = c.get('auth');
    if (!auth) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const params = c.req.valid('query');

    try {
      const redirectUri = params.redirect_uri.trim();
      const codeChallenge = params.code_challenge.trim();
      const codeChallengeMethod = normalizePkceMethod(params.code_challenge_method);

      const client = await requireOAuthClient({
        prisma,
        clientId: params.client_id,
        redirectUri,
      });

      const scopes = parseScopes(params.scope);

      const { code } = await issueAuthorizationCode({
        userId: auth.userId,
        clientId: client.clientId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod,
        scopes,
      });

      let redirectTarget: URL;
      try {
        redirectTarget = new URL(redirectUri);
      } catch (urlError) {
        throw new AuthorizationError('redirect_uri is invalid');
      }

      redirectTarget.searchParams.set('code', code);
      if (params.state) {
        redirectTarget.searchParams.set('state', params.state);
      }

      return c.redirect(redirectTarget.toString(), 302);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return c.json({ error: 'invalid_request', message: error.message }, 400);
      }
      console.error('[oauth/authorize] Failed to issue authorization code', error);
      return c.json(
        { error: 'server_error', message: 'Unable to complete authorization request' },
        500
      );
    }
  }
);

function parseScopes(scope: string | undefined): PermissionScope[] {
  if (!scope) {
    return [];
  }
  const allowed = new Set<PermissionScope>(VALID_SCOPES);
  return Array.from(
    new Set(
      scope
        .split(/\s+/)
        .map((value) => value.trim())
        .filter((value): value is PermissionScope => value.length > 0 && allowed.has(value as PermissionScope))
    )
  );
}

export { authorizeRoute };

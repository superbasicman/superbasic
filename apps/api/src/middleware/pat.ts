import type { Context, Next } from 'hono';
import { authService } from '../lib/auth-service.js';
import { prisma, resetPostgresContext } from '@repo/database';
import { AuthorizationError } from '@repo/auth-core';
import type { PermissionScope } from '@repo/auth-core';
import { checkFailedAuthRateLimit, trackFailedAuth } from './rate-limit/index.js';
import { tokenRepository, userRepository } from '../services/index.js';

export async function patMiddleware(c: Context, next: Next) {
  const requestId = c.get('requestId') || 'unknown';
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown';
  let contextTouched = false;

  const resetContext = async () => {
    if (!contextTouched) {
      return;
    }
    try {
      await resetPostgresContext(prisma);
    } catch (contextError) {
      console.error('[pat] Failed to reset Postgres context', contextError);
    } finally {
      contextTouched = false;
    }
  };

  try {
    try {
      const isRateLimited = await checkFailedAuthRateLimit(ip);
      if (isRateLimited) {
        return c.json(
          {
            error: 'Too many failed authentication attempts',
            message: 'Rate limit exceeded. Please try again later.',
          },
          429
        );
      }
    } catch (rateLimitError) {
      console.error('Rate limit check failed:', rateLimitError);
    }

    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      await trackFailedAuth(ip);
      return c.json({ error: 'Missing or invalid Authorization header' }, 401);
    }

    const auth = await authService.verifyRequest({
      authorizationHeader: authHeader,
      workspaceHeader: c.req.header('x-workspace-id') ?? null,
      workspacePathParam: c.req.param?.('workspaceId') ?? null,
      requestId,
    });

    if (!auth) {
      await trackFailedAuth(ip);
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const [user, token] = await Promise.all([
      userRepository.findById(auth.userId),
      auth.tokenId ? tokenRepository.findById(auth.tokenId) : Promise.resolve(null),
    ]);
    const tokenScopes =
      token?.scopes && token.scopes.length ? (token.scopes as PermissionScope[]) : auth.scopes ?? [];

    c.set('auth', { ...auth, scopes: tokenScopes });
    c.set('userId', auth.userId);
    c.set('userEmail', user?.primaryEmail ?? '');
    c.set('profileId', auth.profileId ?? undefined);
    c.set('workspaceId', auth.activeWorkspaceId);
    c.set('authType', 'pat');
    c.set('tokenId', auth.tokenId ?? undefined);
    c.set('tokenScopes', tokenScopes);
    c.set('tokenScopesRaw', tokenScopes);
    contextTouched = true;

    await next();
  } catch (error) {
    console.error('PAT middleware error:', error);
    try {
      await trackFailedAuth(ip);
    } catch (e) {
      console.error('Failed to track auth failure:', e);
    }
    if (error instanceof AuthorizationError) {
      await resetContext();
      return c.json({ error: error.message || 'Invalid workspace selection' }, 400);
    }
    return c.json({ error: 'Unauthorized' }, 401);
  } finally {
    await resetContext();
  }
}

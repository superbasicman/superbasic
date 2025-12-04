import type { Context, Next } from 'hono';
import { parseOpaqueToken } from '@repo/auth';
import type { PermissionScope } from '@repo/auth-core';
import { authService } from '../lib/auth-service.js';
import { prisma, resetPostgresContext } from '@repo/database';
import { AuthorizationError } from '@repo/auth-core';
import { checkFailedAuthRateLimit, trackFailedAuth } from './rate-limit/index.js';

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

    const parsedToken = parseOpaqueToken(authHeader.split(' ')[1] ?? '');
    const tokenId = parsedToken?.tokenId ?? null;
    const tokenRecord = tokenId
      ? await prisma.apiKey.findUnique({
          where: { id: tokenId },
          select: { scopes: true },
        })
      : null;
    const tokenScopesRaw =
      (tokenRecord?.scopes as unknown[])?.map((s) => s?.toString() ?? '') ?? [];
    const effectiveScopes =
      (tokenRecord?.scopes?.length
        ? (tokenRecord.scopes as PermissionScope[])
        : (auth.scopes as PermissionScope[] | undefined)) ?? [];
    const authWithPatScopes = { ...auth, scopes: effectiveScopes };

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { primaryEmail: true },
    });

    c.set('auth', authWithPatScopes);
    c.set('userId', auth.userId);
    c.set('userEmail', user?.primaryEmail ?? '');
    c.set('profileId', auth.profileId ?? undefined);
    c.set('workspaceId', auth.activeWorkspaceId);
    c.set('authType', 'pat');
    c.set('tokenId', tokenId ?? undefined);
    c.set('tokenScopes', authWithPatScopes.scopes);
    c.set('tokenScopesRaw', tokenScopesRaw.length ? tokenScopesRaw : authWithPatScopes.scopes);
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

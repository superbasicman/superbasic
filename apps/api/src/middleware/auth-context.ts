import type { Context, Next } from 'hono';
import type { VerifyRequestInput } from '@repo/auth-core';
import type { AppBindings } from '../types/context.js';
import { authService } from '../lib/auth-service.js';
import { prisma, setPostgresContext } from '@repo/database';

function extractBearer(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : null;
}

export async function attachAuthContext(c: Context<AppBindings>, next: Next) {
  const authorizationHeader = c.req.header('authorization');
  const bearer = extractBearer(authorizationHeader);

  if (bearer?.startsWith('sbf_')) {
    // Personal access tokens are handled by patMiddleware/unifiedAuthMiddleware
    c.set('auth', null);
    try {
      await setPostgresContext(prisma, {
        userId: null,
        profileId: null,
        workspaceId: null,
      });
    } catch (contextError) {
      console.error('[auth-context] Failed to reset Postgres context for PAT request', contextError);
    }
    await next();
    return;
  }

  try {
    const verifyInput: VerifyRequestInput = {
      url: c.req.url,
      method: c.req.method,
    };

    if (authorizationHeader) {
      verifyInput.authorizationHeader = authorizationHeader;
    }

    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip');
    if (ip) {
      verifyInput.ipAddress = ip;
    }

    const userAgent = c.req.header('user-agent');
    if (userAgent) {
      verifyInput.userAgent = userAgent;
    }

    const requestId = c.get('requestId');
    if (requestId) {
      verifyInput.requestId = requestId;
    }

    const workspaceHeader =
      c.req.header('x-workspace-id') ?? c.req.header('x-superbasic-workspace-id');
    if (workspaceHeader) {
      verifyInput.workspaceHeader = workspaceHeader;
    }

    const workspacePathParam = c.req.param('workspaceId');
    if (workspacePathParam) {
      verifyInput.workspacePathParam = workspacePathParam;
    }

    const authContext = await authService.verifyRequest({
      ...verifyInput,
    });

    c.set('auth', authContext);

    if (authContext) {
      c.set('userId', authContext.userId);
      c.set('profileId', authContext.profileId ?? null);
      c.set('authType', 'session');
      try {
        await setPostgresContext(prisma, {
          userId: authContext.userId,
          profileId: authContext.profileId,
          workspaceId: authContext.activeWorkspaceId,
        });
      } catch (contextError) {
        console.error('[auth-context] Failed to set Postgres context', contextError);
      }
    } else {
      try {
        await setPostgresContext(prisma, {
          userId: null,
          profileId: null,
          workspaceId: null,
        });
      } catch (contextError) {
        console.error('[auth-context] Failed to reset Postgres context for unauthenticated request', contextError);
      }
    }

    await next();
  } catch (error) {
    console.error('[auth-context] Failed to verify request', error);
    try {
      await setPostgresContext(prisma, {
        userId: null,
        profileId: null,
        workspaceId: null,
      });
    } catch (contextError) {
      console.error('[auth-context] Failed to reset Postgres context after auth error', contextError);
    }
    c.set('auth', null);
    return c.json({ error: 'Unauthorized' }, 401);
  }
}

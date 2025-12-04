import type { Context, Next } from 'hono';
import { parseOpaqueToken } from '@repo/auth';
import { AuthorizationError, UnauthorizedError, type VerifyRequestInput } from '@repo/auth-core';
import type { AppBindings } from '../types/context.js';
import { authService } from '../lib/auth-service.js';
import {
  prisma,
  resetPostgresContext,
  setPostgresContext,
  type PostgresAppContext,
} from '@repo/database';

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
  let contextTouched = false;

  const resetContext = async () => {
    if (!contextTouched) {
      return;
    }
    try {
      await resetPostgresContext(prisma);
    } catch (contextError) {
      console.error('[auth-context] Failed to reset Postgres context', contextError);
    } finally {
      contextTouched = false;
    }
  };

  const setContext = async (context: PostgresAppContext) => {
    try {
      await setPostgresContext(prisma, context);
      contextTouched = true;
    } catch (contextError) {
      console.error('[auth-context] Failed to set Postgres context', contextError);
    }
  };

  if (bearer?.startsWith('sbf_')) {
    // Personal access tokens are handled by patMiddleware/unifiedAuthMiddleware
    c.set('auth', null);
    await setContext({
      userId: null,
      profileId: null,
      workspaceId: null,
      mfaLevel: null,
    });
    await next();
    await resetContext();
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

    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip');
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

    if (authContext && !authContext.authTime) {
      authContext.authTime = new Date();
    }

    c.set('auth', authContext);

    if (authContext) {
      const isPat = !authContext.sessionId && authContext.clientType === 'cli';
      const tokenInfo =
        isPat && authorizationHeader
          ? parseOpaqueToken(extractBearer(authorizationHeader) ?? '')
          : null;

      c.set('userId', authContext.userId);
      c.set('profileId', authContext.profileId ?? null);
      c.set('workspaceId', authContext.activeWorkspaceId ?? null);
      c.set('allowedWorkspaces', authContext.allowedWorkspaces ?? []);
      c.set('principalType', authContext.principalType);
      c.set('serviceId', authContext.serviceId ?? null);
      c.set('clientId', authContext.clientId ?? null);
      c.set('authType', isPat ? 'pat' : 'session');
      if (isPat) {
        c.set('tokenScopes', authContext.scopes);
        c.set('tokenScopesRaw', authContext.scopes);
        if (tokenInfo) {
          c.set('tokenId', tokenInfo.tokenId);
        }
      }
      await setContext({
        userId: authContext.userId,
        profileId: authContext.profileId,
        workspaceId: authContext.activeWorkspaceId,
        mfaLevel: authContext.mfaLevel,
      });
    } else {
      await setContext({
        userId: null,
        profileId: null,
        workspaceId: null,
        mfaLevel: null,
      });
    }

    await next();
  } catch (error) {
    console.error('[auth-context] Failed to verify request', error);
    c.set('auth', null);
    if (error instanceof AuthorizationError) {
      await resetContext();
      return c.json({ error: error.message || 'Invalid workspace selection' }, 403);
    }
    if (error instanceof UnauthorizedError) {
      await resetContext();
      return c.json({ error: error.message || 'Unauthorized' }, 401);
    }

    // Infrastructure failures (DB down, etc) should return 503
    await resetContext();
    return c.json({ error: 'Service Unavailable', message: 'Authentication service temporarily unavailable' }, 503);
  } finally {
    await resetContext();
  }
}

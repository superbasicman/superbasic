import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Context } from 'hono';
import { prisma } from '@repo/database';
import { AUTHJS_CREDENTIALS_PROVIDER_ID, authEvents, verifyPassword } from '@repo/auth';
import { authService } from '../../../lib/auth-service.js';
import { generateAccessToken } from '@repo/auth-core';
import type { AppBindings } from '../../../types/context.js';
import { setRefreshTokenCookie } from './refresh-cookie.js';

const CLIENT_TYPES = ['web', 'mobile', 'cli', 'partner', 'other'] as const;

const LoginRequestSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
  clientType: z.enum(CLIENT_TYPES).optional(),
});

type LoginRequest = z.infer<typeof LoginRequestSchema>;
type ValidatedRequest = {
  valid: (type: 'json') => LoginRequest;
};

export const loginValidator = zValidator('json', LoginRequestSchema, (result, c) => {
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

export async function login(c: Context<AppBindings>) {
  const payload = (c.req as typeof c.req & ValidatedRequest).valid('json');
  const normalizedEmail = payload.email.trim().toLowerCase();
  const ipAddress = extractIp(c) ?? null;
  const userAgent = c.req.header('user-agent') ?? null;
  const requestId = c.get('requestId') ?? null;

  // Prefer canonical emailLower column; fall back to legacy email case-insensitive.
  const user =
    (await prisma.user.findUnique({
      where: { emailLower: normalizedEmail },
    })) ??
    (await prisma.user.findFirst({
      where: {
        email: {
          equals: payload.email,
          mode: 'insensitive',
        },
      },
    }));

  if (!user || !user.password) {
    await emitLoginFailed(normalizedEmail, {
      provider: AUTHJS_CREDENTIALS_PROVIDER_ID,
      reason: 'user_not_found_or_missing_password',
      ip: ipAddress,
      userAgent,
      requestId,
    });
    return c.json({ error: 'invalid_grant', message: 'Invalid email or password' }, 401);
  }

  if (user.status !== 'active') {
    await emitLoginFailed(normalizedEmail, {
      provider: AUTHJS_CREDENTIALS_PROVIDER_ID,
      reason: 'account_inactive',
      userId: user.id,
      ip: ipAddress,
      userAgent,
      requestId,
    });
    return c.json({ error: 'account_disabled', message: 'Account is disabled' }, 403);
  }

  const passwordValid = await verifyPassword(payload.password, user.password);
  if (!passwordValid) {
    await emitLoginFailed(normalizedEmail, {
      provider: AUTHJS_CREDENTIALS_PROVIDER_ID,
      reason: 'invalid_password',
      userId: user.id,
      ip: ipAddress,
      userAgent,
      requestId,
    });
    return c.json({ error: 'invalid_grant', message: 'Invalid email or password' }, 401);
  }

  const clientType = payload.clientType ?? 'web';
  const rememberMe = payload.rememberMe ?? false;

  const { session: sessionHandle, refresh: refreshResult } = await authService.createSessionWithRefresh({
    userId: user.id,
    identity: {
      provider: AUTHJS_CREDENTIALS_PROVIDER_ID,
      providerUserId: user.id,
      email: user.email ?? payload.email,
      emailVerified: Boolean(user.emailVerified),
    },
    clientType,
    rememberMe,
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent } : {}),
    mfaLevel: 'none',
    refreshMetadata: {
      source: 'auth-login-endpoint',
      clientType,
      ipAddress,
      userAgent,
      requestId,
    },
  });

  const { token: accessToken, claims } = await generateAccessToken({
    userId: sessionHandle.userId,
    sessionId: sessionHandle.sessionId,
    clientType: sessionHandle.clientType,
    mfaLevel: sessionHandle.mfaLevel,
    reauthenticatedAt: Math.floor(Date.now() / 1000),
  });

  setRefreshTokenCookie(c, refreshResult.refreshToken, refreshResult.token.expiresAt);

  await authEvents.emit({
    type: 'user.login.success',
    userId: user.id,
    email: user.email ?? payload.email,
    ...(ipAddress ? { ip: ipAddress } : {}),
    metadata: {
      provider: AUTHJS_CREDENTIALS_PROVIDER_ID,
      sessionId: sessionHandle.sessionId,
      clientType: sessionHandle.clientType,
      requestId,
      userAgent,
      timestamp: new Date().toISOString(),
    },
  });

  return c.json({
    tokenType: 'Bearer',
    accessToken,
    refreshToken: refreshResult.refreshToken,
    expiresIn: claims.exp - claims.iat,
    sessionId: sessionHandle.sessionId,
  });
}

async function emitLoginFailed(
  email: string,
  metadata: {
    provider: string;
    reason: string;
    userId?: string;
    ip?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
  }
) {
  await authEvents.emit({
    type: 'user.login.failed',
    email,
    ...(metadata.userId ? { userId: metadata.userId } : {}),
    ...(metadata.ip ? { ip: metadata.ip } : {}),
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString(),
    },
  });
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

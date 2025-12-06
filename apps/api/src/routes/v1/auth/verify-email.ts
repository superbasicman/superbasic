import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { setCookie } from 'hono/cookie';
import { COOKIE_NAME, LOCAL_PASSWORD_PROVIDER_ID } from '@repo/auth';
import {
  TokenExpiredError,
  TokenInvalidError,
  TokenAlreadyConsumedError,
  EmailAlreadyVerifiedError,
} from '@repo/core';
import { authService } from '../../../lib/auth-service.js';
import { verificationService } from '../../../services/index.js';
import { setRefreshTokenCookie } from './refresh-cookie.js';
import { generateCsrfToken, setCsrfCookie } from '../../../middleware/csrf.js';
import type { AppBindings } from '../../../types/context.js';

const verifyEmail = new Hono<AppBindings>();

const WEB_APP_URL = process.env.WEB_APP_URL || 'http://localhost:5173';

/**
 * GET /v1/auth/verify-email
 * Verifies email verification token and logs user in
 */
verifyEmail.get(
  '/',
  zValidator(
    'query',
    z.object({
      token: z.string().min(1),
    })
  ),
  async (c) => {
    const { token } = c.req.valid('query');

    try {
      const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip');
      const userAgent = c.req.header('user-agent');
      const requestId = c.get('requestId');

      const result = await verificationService.verifyEmailToken({
        token,
        ...(ip || userAgent || requestId
          ? {
              requestContext: {
                ...(ip && { ip }),
                ...(userAgent && { userAgent }),
                ...(requestId && { requestId }),
              },
            }
          : {}),
      });

      const ipAddress = ip ?? null;
      const userAgentHeader = userAgent ?? null;

      // Create session for verified user
      const { session, refresh } = await authService.createSessionWithRefresh({
        userId: result.userId,
        clientType: 'web',
        ipAddress,
        userAgent: userAgentHeader,
        rememberMe: true,
        identity: {
          provider: LOCAL_PASSWORD_PROVIDER_ID,
          providerSubject: result.userId,
          email: result.email,
          emailVerified: true,
        },
      });

      // Set session cookie
      setCookie(c, COOKIE_NAME, session.sessionId, {
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60, // 30 days
        sameSite: 'Lax',
      });

      setRefreshTokenCookie(c, refresh.refreshToken, refresh.token.expiresAt);

      // Set CSRF token for browser-based flows
      const csrfToken = generateCsrfToken();
      setCsrfCookie(c, csrfToken);

      // Redirect directly to app - session/refresh cookies are already set
      // Frontend will use refresh token to get access token on load
      const successUrl = new URL('/', WEB_APP_URL);
      successUrl.searchParams.set('verified', 'true');

      return c.redirect(successUrl.toString());
    } catch (error) {
      const errorUrl = new URL('/login', WEB_APP_URL);

      if (error instanceof TokenExpiredError) {
        errorUrl.searchParams.set('error', 'token_expired');
        errorUrl.searchParams.set(
          'error_description',
          'Verification link has expired. Please request a new one.'
        );
      } else if (error instanceof TokenAlreadyConsumedError) {
        errorUrl.searchParams.set('error', 'token_used');
        errorUrl.searchParams.set(
          'error_description',
          'Verification link has already been used.'
        );
      } else if (error instanceof EmailAlreadyVerifiedError) {
        errorUrl.searchParams.set('error', 'already_verified');
        errorUrl.searchParams.set(
          'error_description',
          'Your email is already verified. Please sign in.'
        );
      } else if (error instanceof TokenInvalidError) {
        errorUrl.searchParams.set('error', 'invalid_token');
        errorUrl.searchParams.set(
          'error_description',
          'Invalid verification link.'
        );
      } else {
        console.error('[verify-email] Unexpected error:', error);
        errorUrl.searchParams.set('error', 'server_error');
        errorUrl.searchParams.set(
          'error_description',
          'An unexpected error occurred.'
        );
      }

      return c.redirect(errorUrl.toString());
    }
  }
);

export { verifyEmail };

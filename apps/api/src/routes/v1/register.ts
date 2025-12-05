import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { setCookie } from 'hono/cookie';
import { RegisterSchema } from '@repo/types';
import { userService } from '../../services/index.js';
import { DuplicateEmailError, InvalidEmailError, WeakPasswordError } from '@repo/core';
import { LOCAL_PASSWORD_PROVIDER_ID, COOKIE_NAME } from '@repo/auth';
import { authService } from '../../lib/auth-service.js';
import { generateCsrfToken, setCsrfCookie } from '../../middleware/csrf.js';

const registerRoute = new Hono();

registerRoute.post('/', zValidator('json', RegisterSchema), async (c) => {
  const { email, password, name } = c.req.valid('json');

  // Extract IP for audit logging
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || undefined;
  const userAgent = c.req.header('user-agent') || undefined;

  try {
    // Call service layer to create user
    const result = await userService.registerUser({
      email,
      password,
      ...(name !== undefined && { name }),
      ...(ip !== undefined && { ip }),
    });

    // Create session so user can proceed with OAuth flow
    const { session } = await authService.createSessionWithRefresh({
      userId: result.user.id,
      clientType: 'web',
      ipAddress: ip ?? null,
      userAgent: userAgent ?? null,
      rememberMe: true,
      identity: {
        provider: LOCAL_PASSWORD_PROVIDER_ID,
        providerSubject: result.user.id,
        email: result.user.email,
        emailVerified: false,
      },
    });

    // Set session cookie so OAuth authorize can find the session
    setCookie(c, COOKIE_NAME, session.sessionId, {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60, // 30 days
      sameSite: 'Lax',
    });

    // Set CSRF token for browser-based flows
    const csrfToken = generateCsrfToken();
    setCsrfCookie(c, csrfToken);

    // Return success response
    return c.json(result, 201);
  } catch (error) {
    // Handle domain errors
    if (error instanceof DuplicateEmailError) {
      return c.json({ error: 'Email already in use' }, 409);
    }
    if (error instanceof InvalidEmailError) {
      return c.json({ error: 'Invalid email format' }, 400);
    }
    if (error instanceof WeakPasswordError) {
      return c.json({ error: error.message }, 400);
    }
    // Let global error handler catch unexpected errors
    throw error;
  }
});

export { registerRoute };

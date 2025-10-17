import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { setCookie } from 'hono/cookie';
import { LoginSchema } from '@repo/types';
import {
  verifyPassword,
  authEvents,
  SESSION_MAX_AGE_SECONDS,
  JWT_SALT,
  COOKIE_NAME,
  authConfig,
} from '@repo/auth';
import { prisma } from '@repo/database';
import { encode } from '@auth/core/jwt';

const loginRoute = new Hono();

loginRoute.post('/', zValidator('json', LoginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  // Normalize email to lowercase and trim
  const normalizedEmail = email.toLowerCase().trim();

  // Look up user
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || undefined;

  if (!user || !user.password) {
    // Emit failed login event
    authEvents.emit({
      type: 'user.login.failed',
      email: normalizedEmail,
      ...(ip && { ip }),
      metadata: { reason: 'user_not_found' },
    });
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  // Verify password
  const valid = await verifyPassword(password, user.password);

  if (!valid) {
    // Emit failed login event
    authEvents.emit({
      type: 'user.login.failed',
      userId: user.id,
      email: user.email,
      ...(ip && { ip }),
      metadata: { reason: 'invalid_password' },
    });
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  // Generate JWT using Auth.js encode with iss and aud claims
  const token = await encode({
    token: {
      sub: user.id,
      id: user.id,
      email: user.email,
      iss: 'sbfin', // Issuer: prevents token reuse across systems
      aud: 'sbfin:web', // Audience: web client sessions only
    },
    secret: authConfig.secret!,
    salt: JWT_SALT,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  // Set httpOnly cookie with environment-appropriate name
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax', // Required for OAuth callbacks (future)
    maxAge: SESSION_MAX_AGE_SECONDS, // Matches JWT exp
    path: '/',
    // No Domain attribute = host-only (sent only to api.superbasicfinance.com)
  });

  // Emit successful login event
  authEvents.emit({
    type: 'user.login.success',
    userId: user.id,
    email: user.email,
    ...(ip && { ip }),
  });

  // Return user profile data
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

export { loginRoute };

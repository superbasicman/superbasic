import { Hono } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { COOKIE_NAME, authEvents } from '@repo/auth';

const logoutRoute = new Hono();

logoutRoute.post('/', (c) => {
  // Delete httpOnly session cookie
  deleteCookie(c, COOKIE_NAME, { path: '/' });

  // Emit user.logout event
  // Note: We don't have user context here since this is before auth middleware
  // The web client should handle emitting with user context if needed
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || undefined;
  authEvents.emit({
    type: 'user.logout',
    ...(ip && { ip }),
  });

  // Return 204 No Content
  return c.body(null, 204);
});

export { logoutRoute };

/**
 * Authentication middleware for protected routes that require a verified session.
 * Relies on {@link attachAuthContext} having already run and populated `c.get('auth')`.
 */

import type { Context, Next } from 'hono';
import type { AppBindings } from '../types/context.js';

export async function authMiddleware(c: Context<AppBindings>, next: Next) {
  const authContext = c.get('auth');
  if (!authContext) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // attachAuthContext already populated userId/profileId/authType, so simply continue
  return next();
}

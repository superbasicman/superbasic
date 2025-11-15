import type { Context, Next } from 'hono';
import type { AppBindings } from '../types/context.js';

/**
 * Placeholder middleware that reserves c.var.auth for the future auth-core context.
 * Downstream middleware can replace the value with a real AuthContext once Phase 2 lands.
 */
export async function attachAuthContext(c: Context<AppBindings>, next: Next) {
  c.set('auth', null);
  await next();
}

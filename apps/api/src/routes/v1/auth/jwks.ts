import type { Context } from 'hono';
import type { AppBindings } from '../../../types/context.js';
import { authService } from '../../../lib/auth-service.js';

export async function getJwks(c: Context<AppBindings>) {
  const jwks = authService.getJwks();
  return c.json(jwks);
}

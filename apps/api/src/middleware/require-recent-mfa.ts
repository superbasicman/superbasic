import type { Context, Next } from 'hono';
import { requireRecentAuth } from '@repo/auth-core';
import type { AppBindings } from '../types/context.js';

export function requireRecentMfa(
  options: { withinSeconds?: number; minMfaLevel?: 'mfa' | 'phishing_resistant' } = {}
) {
  const windowSeconds = options.withinSeconds ?? 15 * 60;
  const minMfaLevel = options.minMfaLevel ?? 'mfa';

  return async (c: Context<AppBindings>, next: Next) => {
    const auth = c.get('auth');
    if (!auth) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      auth.authTime ??= new Date();
      requireRecentAuth(auth, { withinSeconds: windowSeconds, minMfaLevel });
    } catch {
      return c.json({ error: 'forbidden', message: 'MFA required' }, 403);
    }

    return next();
  };
}

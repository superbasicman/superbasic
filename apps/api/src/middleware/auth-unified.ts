/**
 * Unified authentication middleware
 * Tries Bearer token auth first, then falls back to session auth
 */

import type { Context, Next } from 'hono';
import { authMiddleware } from './auth.js';
import { patMiddleware } from './pat.js';

/**
 * Unified authentication middleware
 * Checks for Bearer token in Authorization header first, then falls back to
 * the authenticated session context populated by attachAuthContext.
 *
 * Both authentication methods set userId and profileId in context.
 * Use this on routes that accept both authentication methods.
 *
 * @example
 * ```typescript
 * // Accept both session and PAT auth
 * app.get("/v1/transactions", unifiedAuthMiddleware, handler);
 *
 * // Session auth only (e.g., token management endpoints)
 * app.post("/v1/tokens", authMiddleware, handler);
 *
 * // PAT auth only (e.g., webhook endpoints)
 * app.post("/v1/webhooks/plaid", patMiddleware, handler);
 * ```
 */
export async function unifiedAuthMiddleware(c: Context, next: Next) {
  const authContext = c.get('auth');
  if (authContext) {
    return next();
  }

  // Check for Bearer token first
  const authHeader = c.req.header('Authorization');
  const hasBearer = authHeader?.toLowerCase().startsWith('bearer ');

  if (hasBearer) {
    return patMiddleware(c, next);
  }

  return authMiddleware(c, next);
}

/**
 * Unified authentication middleware
 * Tries Bearer token auth first, then falls back to session auth
 */

import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { authMiddleware } from "./auth.js";
import { patMiddleware } from "./pat.js";

/**
 * Unified authentication middleware
 * Checks for Bearer token in Authorization header first, then falls back to session cookie
 *
 * Priority order:
 * 1. Authorization: Bearer <token> header (PAT auth)
 * 2. Session cookie (session auth)
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
  // Check for Bearer token first
  const authHeader = c.req.header("Authorization");
  const hasBearer = authHeader?.startsWith("Bearer ");

  if (hasBearer) {
    return patMiddleware(c, next);
  }

  // Fall back to session cookie
  // Auth.js uses 'authjs.session-token' cookie name
  // Check if cookie exists using getCookie (more reliable than string matching)
  const sessionCookie = getCookie(c, "authjs.session-token");

  if (sessionCookie) {
    return authMiddleware(c, next);
  }

  // No authentication provided
  return c.json({ error: "Unauthorized" }, 401);
}

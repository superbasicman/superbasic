/**
 * Scope enforcement middleware for API endpoints
 * Validates that PAT tokens have required permissions for operations
 */

import type { Context, Next } from "hono";
import { hasScope, authEvents, type Scope } from "@repo/auth";

/**
 * Scope enforcement middleware factory
 * Verifies token has required scope for the operation
 * Session auth bypasses scope checks (full access)
 *
 * @param requiredScope - The scope required to access the endpoint
 * @returns Middleware function that enforces the scope
 *
 * @example
 * ```typescript
 * app.get("/v1/transactions", requireScope("read:transactions"), handler);
 * app.post("/v1/transactions", requireScope("write:transactions"), handler);
 * ```
 */
export function requireScope(requiredScope: Scope) {
  return async (c: Context, next: Next) => {
    const authType = c.get("authType");

    // Session auth has full access (bypass scope check)
    if (authType === "session") {
      return next();
    }

    // PAT auth requires scope check
    if (authType === "pat") {
      const tokenScopes = (c.get("tokenScopes") as string[]) || [];
      const tokenId = c.get("tokenId") as string;
      const userId = c.get("userId") as string;

      if (!hasScope(tokenScopes, requiredScope)) {
        // Emit audit event for scope denial
        const ip =
          c.req.header("x-forwarded-for") ||
          c.req.header("x-real-ip") ||
          "unknown";

        authEvents.emit({
          type: "token.scope_denied",
          userId,
          metadata: {
            tokenId,
            endpoint: c.req.path,
            method: c.req.method,
            requiredScope,
            providedScopes: tokenScopes,
            ip,
            userAgent: c.req.header("user-agent") || "unknown",
          },
        });

        return c.json(
          {
            error: "Insufficient permissions",
            required: requiredScope,
          },
          403
        );
      }

      return next();
    }

    // No auth type set (shouldn't happen if auth middleware ran)
    return c.json({ error: "Unauthorized" }, 401);
  };
}

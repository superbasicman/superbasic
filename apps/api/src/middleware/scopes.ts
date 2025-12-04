/**
 * Scope enforcement middleware for API endpoints
 * Validates that the authenticated user/token has required permissions
 */

import type { Context, Next } from "hono";
import { authz, AuthorizationError, type PermissionScope } from "@repo/auth-core";
import type { AppBindings } from "../types/context.js";

/**
 * Scope enforcement middleware factory
 * Verifies auth context has required scope for the operation
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
export function requireScope(requiredScope: PermissionScope) {
  return async (c: Context<AppBindings>, next: Next) => {
    const auth = c.get("auth");
    const tokenScopes = ((c.get("tokenScopes") as string[]) || []).map((scope) => scope.toString());

    try {
      const scopes = auth?.scopes ?? tokenScopes;
      const hasAdmin = scopes.includes("admin");
      if (auth) {
        if (!hasAdmin) {
          authz.requireScope(auth, requiredScope);
        }
      } else {
        const hasRequired = hasAdmin || scopes.includes(requiredScope);
        if (!hasRequired) {
          return c.json(
            {
              error: "Insufficient permissions",
              required: requiredScope,
            },
            403
          );
        }
      }
    } catch (error) {
      if (
        error instanceof AuthorizationError ||
        (error instanceof Error && error.name === "AuthorizationError")
      ) {
        return c.json(
          {
            error: "Insufficient permissions",
            required: requiredScope,
          },
          403
        );
      }
      throw error;
    }

    await next();
  };
}

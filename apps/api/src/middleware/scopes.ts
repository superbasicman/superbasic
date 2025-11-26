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
    const authType = c.get("authType");
    const tokenScopes = ((c.get("tokenScopes") as string[]) || []).map((scope) => scope.toString());
    const tokenScopesRaw = ((c.get("tokenScopesRaw") as string[]) || []).map((scope) =>
      scope.toString()
    );

    // Session auth has full access (legacy behavior; scopes enforced for PATs only)
    if (authType === "session") {
      await next();
      return;
    }

    try {
      const isPat = authType === "pat" || auth?.clientType === "cli";

      if (isPat) {
        console.warn("[requireScope][pat] evaluation", {
          requiredScope,
          authScopes: auth?.scopes,
          tokenScopesRaw,
          tokenScopes,
          authType,
        });
        const scoped = auth
          ? auth.scopes.includes("admin") || auth.scopes.includes(requiredScope)
          : tokenScopesRaw.includes("admin") || tokenScopesRaw.includes(requiredScope);
        // Debug log for PAT scope evaluation
        if (!scoped) {
          console.warn("[requireScope][pat] insufficient scope", {
            requiredScope,
            authScopes: auth?.scopes,
            tokenScopesRaw,
            tokenScopes,
            authType,
          });
        }
        if (!scoped) {
          return c.json(
            {
              error: "Insufficient permissions",
              required: requiredScope,
            },
            403
          );
        }
        await next();
        return;
      }

      if (auth) {
        if (auth.scopes.includes("admin")) {
          await next();
          return;
        }
        authz.requireScope(auth, requiredScope);
      } else {
        if (tokenScopes.includes("admin")) {
          await next();
          return;
        }
        const hasRequired = tokenScopes.includes(requiredScope);
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

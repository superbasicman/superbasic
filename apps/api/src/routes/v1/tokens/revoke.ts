/**
 * DELETE /v1/tokens/:id - Revoke API token
 * 
 * Requires session authentication
 * Soft deletes token by setting revokedAt timestamp
 * Operation is idempotent (already revoked = 204)
 */

import { Hono } from "hono";
import { authMiddleware } from "../../../middleware/auth.js";
import { TokenNotFoundError } from "@repo/core";
import { tokenService } from "../../../services/index.js";
import { requireScope } from "../../../middleware/scopes.js";

type Variables = {
  userId: string;
  requestId?: string;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

const revokeTokenRoute = new Hono<{ Variables: Variables }>();

revokeTokenRoute.delete("/:id", authMiddleware, requireScope("write:accounts"), async (c) => {
  const userId = c.get("userId") as string;
  const requestId = c.get("requestId") || "unknown";
  const tokenId = c.req.param("id");

  if (!isValidUuid(tokenId)) {
    return c.json({ error: "Token not found" }, 404);
  }

  try {
    await tokenService.revokeToken({
      id: tokenId,
      userId,
      requestContext: {
        ip:
          c.req.header("x-forwarded-for") ||
          c.req.header("x-real-ip") ||
          "unknown",
        userAgent: c.req.header("user-agent") || "unknown",
        requestId,
      },
    });
  } catch (error) {
    if (error instanceof TokenNotFoundError) {
      return c.json({ error: "Token not found" }, 404);
    }

    throw error;
  }

  // Return 204 No Content on success
  return c.body(null, 204);
});

export { revokeTokenRoute };

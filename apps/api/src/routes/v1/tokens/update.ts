/**
 * PATCH /v1/tokens/:id - Update API token name
 * 
 * Requires session authentication
 * Updates token name only (no token regeneration)
 * Validates name uniqueness per user
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { UpdateTokenRequestSchema } from "@repo/types";
import {
  DuplicateTokenNameError,
  TokenNotFoundError,
} from "@repo/core";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRecentMfa } from "../../../middleware/require-recent-mfa.js";
import { requireScope } from "../../../middleware/scopes.js";
import { renamePersonalAccessToken } from "../../../lib/pat-tokens.js";

type Variables = {
  userId: string;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

const updateTokenRoute = new Hono<{ Variables: Variables }>();

updateTokenRoute.patch(
  "/:id",
  authMiddleware, // Requires session auth
  requireRecentMfa(),
  requireScope("write:accounts"),
  zValidator("json", UpdateTokenRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Validation failed", issues: (result as any).error.issues }, 400);
    }
  }),
  async (c) => {
    const userId = c.get("userId") as string;
    const tokenId = c.req.param("id");
    const { name } = c.req.valid("json");
    const ipHeader = c.req.header("x-forwarded-for") || c.req.header("x-real-ip");
    const userAgentHeader = c.req.header("user-agent");
    const requestId = c.get("requestId");

    if (!isValidUuid(tokenId)) {
      return c.json({ error: "Token not found" }, 404);
    }

    try {
      const token = await renamePersonalAccessToken({
        tokenId,
        userId,
        name,
        requestContext: {
          ...(ipHeader ? { ip: ipHeader } : {}),
          ...(userAgentHeader ? { userAgent: userAgentHeader } : {}),
          ...(requestId ? { requestId } : {}),
        },
      });

      return c.json(token);
    } catch (error) {
      if (error instanceof TokenNotFoundError) {
        return c.json({ error: "Token not found" }, 404);
      }

      if (error instanceof DuplicateTokenNameError) {
        return c.json({ error: error.message }, 409);
      }

      throw error;
    }
  }
);

export { updateTokenRoute };

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
import { tokenService } from "../../../services/index.js";

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
  zValidator("json", UpdateTokenRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Validation failed", issues: (result as any).error.issues }, 400);
    }
  }),
  async (c) => {
    const userId = c.get("userId") as string;
    const tokenId = c.req.param("id");
    const { name } = c.req.valid("json");

    if (!isValidUuid(tokenId)) {
      return c.json({ error: "Token not found" }, 404);
    }

    try {
      // Delegate business logic to service layer
      const token = await tokenService.updateToken({
        id: tokenId,
        userId,
        name,
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

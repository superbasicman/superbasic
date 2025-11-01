/**
 * GET /v1/tokens - List user's API tokens
 * 
 * Requires session authentication
 * Returns all active tokens for the authenticated user
 * Token values are masked (only last 4 characters visible)
 */

import { Hono } from "hono";
import { authMiddleware } from "../../../middleware/auth.js";
import { tokenService } from "../../../services/index.js";

type Variables = {
  userId: string;
};

const listTokensRoute = new Hono<{ Variables: Variables }>();

listTokensRoute.get("/", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;

  // Delegate to service layer for business logic and data access
  const tokens = await tokenService.listTokens({ userId });

  return c.json({ tokens });
});

export { listTokensRoute };

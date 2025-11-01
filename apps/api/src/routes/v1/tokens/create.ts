/**
 * POST /v1/tokens - Create new API token
 * 
 * Requires session authentication (no PAT creation via PAT)
 * Generates cryptographically secure token, hashes it, and stores in database
 * Returns plaintext token once (never retrievable again)
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CreateTokenRequestSchema } from "@repo/types";
import { DuplicateTokenNameError, InvalidScopesError, InvalidExpirationError } from "@repo/core";
import { authMiddleware } from "../../../middleware/auth.js";
import { tokenCreationRateLimitMiddleware } from "../../../middleware/rate-limit/index.js";
import { tokenService } from "../../../services/index.js";

type Variables = {
  userId: string;
  profileId?: string;
  requestId?: string;
};

const createTokenRoute = new Hono<{ Variables: Variables }>();

createTokenRoute.post(
  "/",
  authMiddleware, // Requires session auth
  tokenCreationRateLimitMiddleware, // 10 tokens per hour per user
  zValidator("json", CreateTokenRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Validation failed", issues: (result as any).error.issues }, 400);
    }
  }),
  async (c) => {
    const userId = c.get("userId") as string;
    const profileId = c.get("profileId") as string | undefined;
    const requestId = c.get("requestId") || "unknown";
    const { name, scopes, expiresInDays } = c.req.valid("json");

    try {
      // Call service layer - business logic lives there
      const result = await tokenService.createToken({
        userId,
        ...(profileId ? { profileId } : {}),
        name,
        scopes,
        expiresInDays,
        requestContext: {
          ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
          userAgent: c.req.header("user-agent") || "unknown",
          requestId,
        },
      });

      // Format HTTP response
      return c.json(
        {
          token: result.token, // Plaintext - user must save this
          ...result.apiKey,
        },
        201
      );
    } catch (error) {
      // Handle domain errors → HTTP status codes
      if (error instanceof DuplicateTokenNameError) {
        return c.json({ error: error.message }, 409);
      }
      if (error instanceof InvalidScopesError) {
        return c.json({ error: error.message }, 400);
      }
      if (error instanceof InvalidExpirationError) {
        return c.json({ error: error.message }, 400);
      }
      // Let global error handler catch unexpected errors
      throw error;
    }
  }
);

export { createTokenRoute };

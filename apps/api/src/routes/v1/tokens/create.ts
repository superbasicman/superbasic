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
import { requireScope } from "../../../middleware/scopes.js";
import type { PermissionScope } from "@repo/auth-core";
import { issuePersonalAccessToken } from "../../../lib/pat-tokens.js";
import { requireRecentMfa } from "../../../middleware/require-recent-mfa.js";

type Variables = {
  userId: string;
  profileId?: string;
  requestId?: string;
};

const createTokenRoute = new Hono<{ Variables: Variables }>();

createTokenRoute.post(
  "/",
  authMiddleware, // Requires session auth
  requireRecentMfa(),
  requireScope("write:accounts"),
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
    const { name, scopes: rawScopes, expiresInDays } = c.req.valid("json");
    const scopes = rawScopes as PermissionScope[];

    if (!profileId) {
      return c.json(
        {
          error: "Profile context is required to create tokens",
        },
        403
      );
    }

    try {
      const requestContext = {
        ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
        userAgent: c.req.header("user-agent") || "unknown",
        requestId,
      };

      const result = await issuePersonalAccessToken({
        userId,
        profileId,
        name,
        scopes,
        expiresInDays,
        requestContext,
      });

      return c.json(result, 201);
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

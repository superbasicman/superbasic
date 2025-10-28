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
import { prisma } from "@repo/database";
import { authMiddleware } from "../../../middleware/auth.js";

type Variables = {
  userId: string;
};

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

    // Find token and verify ownership
    const token = await prisma.apiKey.findUnique({
      where: { id: tokenId },
    });

    // Return 404 if token not found, belongs to different user, or is revoked
    if (!token || token.userId !== userId || token.revokedAt) {
      return c.json({ error: "Token not found" }, 404);
    }

    // Check for duplicate name (unique per user)
    const existing = await prisma.apiKey.findUnique({
      where: { 
        userId_name: { 
          userId, 
          name 
        } 
      },
    });

    // If duplicate exists and it's not the current token, reject
    if (existing && existing.id !== tokenId) {
      return c.json({ error: "Token name already exists" }, 409);
    }

    // Update token name
    const updated = await prisma.apiKey.update({
      where: { id: tokenId },
      data: { name },
    });

    // Return updated token metadata
    return c.json({
      id: updated.id,
      name: updated.name,
      scopes: updated.scopes as string[],
      createdAt: updated.createdAt.toISOString(),
      lastUsedAt: updated.lastUsedAt?.toISOString() ?? null,
      expiresAt: updated.expiresAt?.toISOString() ?? null,
      maskedToken: `sbf_****${updated.last4}`,
    });
  }
);

export { updateTokenRoute };

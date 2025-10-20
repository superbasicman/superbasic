/**
 * DELETE /v1/tokens/:id - Revoke API token
 * 
 * Requires session authentication
 * Soft deletes token by setting revokedAt timestamp
 * Operation is idempotent (already revoked = 204)
 */

import { Hono } from "hono";
import { prisma } from "@repo/database";
import { authMiddleware } from "../../../middleware/auth.js";
import { authEvents } from "@repo/auth";

const revokeTokenRoute = new Hono();

revokeTokenRoute.delete("/:id", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  const requestId = c.get("requestId") || "unknown";
  const tokenId = c.req.param("id");

  // Find token and verify ownership
  const token = await prisma.apiKey.findUnique({
    where: { id: tokenId },
  });

  // Return 404 if token not found or belongs to different user
  if (!token || token.userId !== userId) {
    return c.json({ error: "Token not found" }, 404);
  }

  // Idempotent: if already revoked, still return 204
  if (!token.revokedAt) {
    // Soft delete token (set revokedAt timestamp)
    await prisma.apiKey.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });

    // Emit audit event (only on first revocation)
    authEvents.emit({
      type: "token.revoked",
      userId,
      metadata: {
        tokenId,
        profileId: token.profileId,
        tokenName: token.name,
        ip:
          c.req.header("x-forwarded-for") ||
          c.req.header("x-real-ip") ||
          "unknown",
        userAgent: c.req.header("user-agent") || "unknown",
        requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Return 204 No Content on success
  return c.body(null, 204);
});

export { revokeTokenRoute };

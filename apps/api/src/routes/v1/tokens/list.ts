/**
 * GET /v1/tokens - List user's API tokens
 * 
 * Requires session authentication
 * Returns all active tokens for the authenticated user
 * Token values are masked (only last 4 characters visible)
 */

import { Hono } from "hono";
import { prisma } from "@repo/database";
import { authMiddleware } from "../../../middleware/auth.js";

type Variables = {
  userId: string;
};

const listTokensRoute = new Hono<{ Variables: Variables }>();

listTokensRoute.get("/", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;

  // Query ApiKey records for authenticated user
  // Filter out revoked tokens (revokedAt IS NULL)
  // Sort by createdAt DESC (newest first)
  const tokens = await prisma.apiKey.findMany({
    where: {
      userId,
      revokedAt: null, // Only show active tokens
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      scopes: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      last4: true, // For masking
    },
  });

  // Mask tokens (show last 4 chars from stored value)
  const maskedTokens = tokens.map((token) => ({
    id: token.id,
    name: token.name,
    scopes: token.scopes as string[],
    createdAt: token.createdAt.toISOString(),
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    expiresAt: token.expiresAt?.toISOString() ?? null,
    maskedToken: `sbf_****${token.last4}`,
  }));

  return c.json({ tokens: maskedTokens });
});

export { listTokensRoute };

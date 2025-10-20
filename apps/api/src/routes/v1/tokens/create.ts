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
import { generateToken, hashToken, validateScopes, authEvents } from "@repo/auth";
import { prisma } from "@repo/database";
import { authMiddleware } from "../../../middleware/auth.js";
import { tokenCreationRateLimitMiddleware } from "../../../middleware/rate-limit.js";

const createTokenRoute = new Hono();

createTokenRoute.post(
  "/",
  authMiddleware, // Requires session auth
  tokenCreationRateLimitMiddleware, // 10 tokens per hour per user
  zValidator("json", CreateTokenRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Validation failed", issues: result.error.issues }, 400);
    }
  }),
  async (c) => {
    const userId = c.get("userId") as string;
    const profileId = c.get("profileId") as string | undefined;
    const { name, scopes, expiresInDays } = c.req.valid("json");

    // Validate scopes (defense in depth - Zod already validates enum)
    if (!validateScopes(scopes)) {
      return c.json({ error: "Invalid scopes provided" }, 400);
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

    if (existing) {
      return c.json({ error: "Token name already exists" }, 409);
    }

    // Generate token and extract last 4 characters before hashing
    const token = generateToken();
    const last4 = token.slice(-4);
    const keyHash = hashToken(token);

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // Create token record (personal token via profileId)
    const apiKey = await prisma.apiKey.create({
      data: {
        userId,
        profileId: profileId || null, // Personal token ownership
        name,
        keyHash,
        last4,
        scopes,
        expiresAt,
      },
    });

    // Emit audit event for token creation
    authEvents.emit({
      type: "token.created",
      userId,
      metadata: {
        tokenId: apiKey.id,
        profileId: profileId || null,
        tokenName: name,
        scopes,
        expiresAt: expiresAt.toISOString(),
        ip:
          c.req.header("x-forwarded-for") ||
          c.req.header("x-real-ip") ||
          "unknown",
        userAgent: c.req.header("user-agent") || "unknown",
      },
    });

    // Return plaintext token (only time it's shown)
    return c.json(
      {
        token, // Plaintext - user must save this
        id: apiKey.id,
        name: apiKey.name,
        scopes: apiKey.scopes as string[],
        createdAt: apiKey.createdAt.toISOString(),
        lastUsedAt: null,
        expiresAt: apiKey.expiresAt?.toISOString() ?? null,
        maskedToken: `sbf_****${apiKey.last4}`,
      },
      201
    );
  }
);

export { createTokenRoute };

/**
 * Personal Access Token (PAT) authentication middleware
 * Validates Bearer tokens from Authorization header and attaches user context to requests
 */

import type { Context, Next } from "hono";
import {
  extractTokenFromHeader,
  isValidTokenFormat,
  hashToken,
  authEvents,
} from "@repo/auth";
import { prisma } from "@repo/database";
import { checkFailedAuthRateLimit, trackFailedAuth } from "./rate-limit.js";

/**
 * PAT authentication middleware that validates Bearer tokens
 *
 * Extracts token from Authorization header, validates format, hashes and looks up in database,
 * checks revocation and expiration status, and attaches user context to the request.
 *
 * Returns 401 Unauthorized for:
 * - Missing or invalid Authorization header
 * - Invalid token format
 * - Token not found in database
 * - Revoked token
 * - Expired token
 *
 * Emits audit events for all authentication failures and successful usage.
 */
export async function patMiddleware(c: Context, next: Next) {
  // Extract IP address for rate limiting
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown";

  // Check if IP has exceeded failed auth rate limit (100 per hour)
  const isRateLimited = await checkFailedAuthRateLimit(ip);
  if (isRateLimited) {
    return c.json(
      {
        error: "Too many failed authentication attempts",
        message: "Rate limit exceeded. Please try again later.",
      },
      429
    );
  }

  try {
    // Extract Bearer token from Authorization header
    const token = extractTokenFromHeader(c.req.header("Authorization"));

    if (!token) {
      await trackFailedAuth(ip);
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }

    // Validate token format before database lookup (prevents injection)
    if (!isValidTokenFormat(token)) {
      // Track failed auth attempt
      await trackFailedAuth(ip);

      // Emit audit event for invalid format
      authEvents.emit({
        type: "token.auth_failed",
        metadata: {
          reason: "invalid_format",
          tokenPrefix: token.substring(0, 8), // Only log prefix for security
          ip,
          userAgent: c.req.header("user-agent") || "unknown",
        },
      });

      return c.json({ error: "Invalid token" }, 401);
    }

    // Hash token and lookup in database
    const keyHash = hashToken(token);

    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        profile: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!apiKey) {
      // Track failed auth attempt
      await trackFailedAuth(ip);

      // Emit audit event for token not found
      authEvents.emit({
        type: "token.auth_failed",
        metadata: {
          reason: "not_found",
          tokenPrefix: token.substring(0, 8),
          ip,
          userAgent: c.req.header("user-agent") || "unknown",
        },
      });

      return c.json({ error: "Invalid token" }, 401);
    }

    // Check revocation status
    if (apiKey.revokedAt) {
      // Track failed auth attempt
      await trackFailedAuth(ip);

      // Emit audit event for revoked token
      authEvents.emit({
        type: "token.auth_failed",
        userId: apiKey.userId,
        metadata: {
          reason: "revoked",
          tokenId: apiKey.id,
          revokedAt: apiKey.revokedAt.toISOString(),
          ip,
          userAgent: c.req.header("user-agent") || "unknown",
        },
      });

      return c.json({ error: "Token revoked" }, 401);
    }

    // Check expiration status
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      // Track failed auth attempt
      await trackFailedAuth(ip);

      // Emit audit event for expired token
      authEvents.emit({
        type: "token.auth_failed",
        userId: apiKey.userId,
        metadata: {
          reason: "expired",
          tokenId: apiKey.id,
          expiresAt: apiKey.expiresAt.toISOString(),
          ip,
          userAgent: c.req.header("user-agent") || "unknown",
        },
      });

      return c.json({ error: "Token expired" }, 401);
    }

    // Update last used timestamp (fire and forget - don't block request)
    prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      })
      .catch((err) => {
        console.error("Failed to update token lastUsedAt:", err);
      });

    // Attach user context and token metadata to request
    // Following user/profile reference pattern: userId for auth, profileId for business logic
    c.set("userId", apiKey.userId);
    c.set("userEmail", apiKey.user.email);
    c.set("profileId", apiKey.profileId);
    c.set("authType", "pat");
    c.set("tokenId", apiKey.id);
    c.set("tokenScopes", apiKey.scopes as string[]);

    await next();

    // Emit audit event for successful token usage after request completes
    authEvents.emit({
      type: "token.used",
      userId: apiKey.userId,
      metadata: {
        tokenId: apiKey.id,
        endpoint: c.req.path,
        method: c.req.method,
        status: c.res.status,
        ip,
        userAgent: c.req.header("user-agent") || "unknown",
      },
    });
  } catch (error) {
    console.error("PAT middleware error:", error);
    // Track failed auth attempt on unexpected errors
    await trackFailedAuth(ip);
    return c.json({ error: "Unauthorized" }, 401);
  }
}

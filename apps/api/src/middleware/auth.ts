/**
 * Authentication middleware for protected routes
 * Validates JWT tokens from httpOnly cookies and attaches user context to requests
 */

import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { decode } from "@auth/core/jwt";
import {
  authConfig,
  JWT_SALT,
  CLOCK_SKEW_TOLERANCE_SECONDS,
  COOKIE_NAME,
} from "@repo/auth";
import { prisma } from "@repo/database";

/**
 * Auth middleware that validates JWT session tokens from httpOnly cookies
 * 
 * Extracts JWT from cookie, verifies signature, validates claims (iss, aud, exp),
 * and attaches user context (userId, userEmail, jti) to the request.
 * 
 * Returns 401 Unauthorized for:
 * - Missing token
 * - Invalid signature
 * - Invalid claims (iss, aud)
 * - Expired token (with clock skew tolerance)
 */
export async function authMiddleware(c: Context, next: Next) {
  try {
    // Extract JWT from httpOnly cookie (web client sessions only)
    const token = getCookie(c, COOKIE_NAME);

    if (!token) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Note: Authorization header support intentionally omitted in v1
    // PATs will use a separate middleware in Phase 2 to prevent confusion
    // between session JWTs and API tokens

    // Verify JWT using Auth.js decode
    const decoded = await decode({
      token,
      secret: authConfig.secret!,
      salt: JWT_SALT,
    });

    if (!decoded || !decoded.id) {
      return c.json({ error: "Invalid or expired token" }, 401);
    }

    // Validate issuer and audience (defense-in-depth)
    if (decoded.iss !== "sbfin" || decoded.aud !== "sbfin:web") {
      return c.json({ error: "Invalid token claims" }, 401);
    }

    // Check expiration with clock skew tolerance
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && now - CLOCK_SKEW_TOLERANCE_SECONDS > decoded.exp) {
      return c.json({ error: "Token expired" }, 401);
    }

    // Attach user context to request
    c.set("userId", decoded.id as string);
    c.set("userEmail", decoded.email as string);
    c.set("jti", decoded.jti as string); // For future token revocation
    c.set("authType", "session"); // Mark as session authentication

    // Fetch profile and attach profileId for business logic
    // Authentication uses userId; business logic uses profileId
    const profile = await prisma.profile.findUnique({
      where: { userId: decoded.id as string },
      select: { id: true },
    });

    if (profile) {
      c.set("profileId", profile.id);
    }

    await next();
  } catch (error) {
    return c.json({ error: "Unauthorized" }, 401);
  }
}

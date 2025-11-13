/**
 * Authentication middleware for protected routes
 * Validates database-backed session cookies issued by Auth.js
 * and attaches user context to downstream handlers.
 */

import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import {
  COOKIE_NAME,
  parseOpaqueToken,
  verifyTokenSecret,
  type TokenHashEnvelope,
} from "@repo/auth";
import { prisma } from "@repo/database";

/**
 * Auth middleware that validates session cookies stored in the database.
 *
 * Extracts the opaque token from the cookie, ensures the associated
 * database row exists, verifies the HMAC hash envelope, checks expiration,
 * and attaches user context (userId, userEmail, jti) to the request.
 */
export async function authMiddleware(c: Context, next: Next) {
  try {
    const rawToken = getCookie(c, COOKIE_NAME);
    if (!rawToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const parsed = parseOpaqueToken(rawToken);
    if (!parsed) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const session = await prisma.session.findUnique({
      where: { tokenId: parsed.tokenId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const isValid = verifyTokenSecret(
      parsed.tokenSecret,
      session.sessionTokenHash as TokenHashEnvelope
    );

    if (!isValid) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (session.expires < new Date()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("userId", session.userId);
    c.set("userEmail", session.user.email ?? "");
    c.set("jti", session.tokenId);
    c.set("authType", "session");

    const profile = await prisma.profile.findUnique({
      where: { userId: session.userId },
      select: { id: true },
    });

    if (profile) {
      c.set("profileId", profile.id);
    }

    await next();
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
}

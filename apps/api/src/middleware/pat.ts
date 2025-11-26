import type { Context, Next } from "hono";
import { parseOpaqueToken } from "@repo/auth";
import { authService } from "../lib/auth-service.js";
import { prisma } from "@repo/database";
import { checkFailedAuthRateLimit, trackFailedAuth } from "./rate-limit/index.js";

export async function patMiddleware(c: Context, next: Next) {
  const requestId = c.get("requestId") || "unknown";
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown";

  try {
    try {
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
    } catch (rateLimitError) {
      console.error("Rate limit check failed:", rateLimitError);
    }

    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      await trackFailedAuth(ip);
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }

    const auth = await authService.verifyRequest({
      authorizationHeader: authHeader,
      workspaceHeader: c.req.header("x-workspace-id") ?? null,
      workspacePathParam: c.req.param?.("workspaceId") ?? null,
      requestId,
    });

    if (!auth) {
      await trackFailedAuth(ip);
      return c.json({ error: "Unauthorized" }, 401);
    }

    const parsedToken = parseOpaqueToken(authHeader.split(" ")[1] ?? "");
    const tokenId = parsedToken?.tokenId ?? null;
    let tokenScopesRaw: string[] = [];

    if (tokenId) {
      const tokenRecord = await prisma.token.findUnique({
        where: { id: tokenId },
        select: { scopes: true },
      });
      if (tokenRecord) {
        tokenScopesRaw = (tokenRecord.scopes as unknown[])?.map((s) => s?.toString() ?? "");
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { email: true },
    });

    const patScopes = tokenScopesRaw.length ? tokenScopesRaw : auth.scopes;
    const authWithPatScopes = {
      ...auth,
      scopes: patScopes as typeof auth.scopes,
    };

    c.set("auth", authWithPatScopes);
    c.set("userId", auth.userId);
    c.set("userEmail", user?.email ?? "");
    c.set("profileId", auth.profileId ?? undefined);
    c.set("workspaceId", auth.activeWorkspaceId);
    c.set("authType", "pat");
    c.set("tokenId", tokenId ?? undefined);
    c.set("tokenScopes", patScopes);
    c.set("tokenScopesRaw", tokenScopesRaw);

    await next();
  } catch (error) {
    console.error("PAT middleware error:", error);
    try {
      await trackFailedAuth(ip);
    } catch (e) {
      console.error("Failed to track auth failure:", e);
    }
    return c.json({ error: "Unauthorized" }, 401);
  }
}

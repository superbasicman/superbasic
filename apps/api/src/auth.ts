/**
 * Auth.js Handler for Hono
 *
 * Custom integration using @auth/core since @auth/hono doesn't exist.
 * This handler wraps Auth.js to work with Hono's Web standard Request/Response APIs.
 */

import { Hono } from "hono";
import { Auth, skipCSRFCheck } from "@auth/core";
import { AUTHJS_CREDENTIALS_PROVIDER_ID, AUTHJS_EMAIL_PROVIDER_ID, authConfig } from "@repo/auth";
import {
  credentialsRateLimitMiddleware,
  magicLinkRateLimitMiddleware,
} from "./middleware/rate-limit/index.js";
import { computeAllowedOrigins } from "./middleware/cors.js";
import { prisma } from "@repo/database";
import {
  parseOpaqueToken,
  type TokenHashEnvelope,
  verifyTokenSecret,
} from "@repo/auth";
import { authService } from "./lib/auth-service.js";
import { randomUUID } from "node:crypto";
import { generateAccessToken } from "@repo/auth-core";
import { SESSION_MAX_AGE_SECONDS } from "@repo/auth";
import { authEvents } from "@repo/auth/events";
import {
  REFRESH_CSRF_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_COOKIE,
  USE_HOST_PREFIX,
} from "./lib/refresh-cookie-constants.js";

const authApp = new Hono();

// Apply credentials rate limiting (5 req/minute per IP) before Auth.js handler
const credentialsCallbackPath = `/callback/${AUTHJS_CREDENTIALS_PROVIDER_ID}`;
const encodedCredentialsCallbackPath = `/callback/${encodeURIComponent(AUTHJS_CREDENTIALS_PROVIDER_ID)}`;
authApp.use(credentialsCallbackPath, credentialsRateLimitMiddleware);
authApp.use(encodedCredentialsCallbackPath, credentialsRateLimitMiddleware);

// Apply magic link rate limiting (3 req/hour per email) before Auth.js handler.
const emailProviderPath = `/signin/${AUTHJS_EMAIL_PROVIDER_ID}`;
const encodedEmailProviderPath = `/signin/${encodeURIComponent(AUTHJS_EMAIL_PROVIDER_ID)}`;
authApp.use(emailProviderPath, magicLinkRateLimitMiddleware);
authApp.use(encodedEmailProviderPath, magicLinkRateLimitMiddleware);

/**
 * Mount Auth.js handler at all routes
 * Auth.js will handle:
 * - /signin/* - Sign in with various providers
 * - /signout - Sign out
 * - /callback/* - OAuth callbacks
 * - /session - Get current session
 * - /csrf - Get CSRF token
 * - /providers - List available providers
 */
authApp.all("/*", async (c) => {
  try {
    // Ensure we always use the runtime @auth/core symbol to disable CSRF checks.
    (authConfig as any).skipCSRFCheck = skipCSRFCheck;

    // Inject unified session creation logic
    (authConfig as any).createSession = async (params: {
      userId: string;
      ipAddress: string | null;
      userAgent: string | null;
      identity: {
        provider: string;
        providerUserId: string;
        email: string | null;
        emailVerified?: boolean;
      };
    }) => {
      // Create session via auth-core
      const session = await authService.createSession({
        userId: params.userId,
        clientType: "web",
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
        rememberMe: true, // Auth.js sessions are persistent by default
        identity: params.identity,
      });

      // Emit audit event (now that we have the session ID)
      authEvents.emit({
        type: "user.session.created",
        userId: params.userId,
        metadata: {
          sessionId: session.sessionId,
          ip: params.ipAddress ?? "unknown",
          userAgent: params.userAgent ?? "unknown",
          timestamp: new Date().toISOString(),
          provider: "authjs-unified", // Or derive from context if possible, but this is generic
        },
      });

      return { sessionId: session.sessionId };
    };

    // Get the original request
    const request = c.req.raw;

    // Skip Auth.js for OPTIONS requests - let CORS middleware handle them
    // This prevents Auth.js from trying to redirect preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    // Call Auth.js with the request and config
    const authResponse = await Auth(request, authConfig);

    // Auth.js returns a new Response without CORS headers
    // We need to add them manually for cross-origin cookie support
    const origin = request.headers.get("origin");
    const headers = new Headers(authResponse.headers);
    const allowedOrigins = computeAllowedOrigins();

    if (origin) {
      // Check if origin is allowed (aligned with CORS middleware)
      const isAllowed = allowedOrigins.has(origin) || /^http:\/\/localhost:\d+$/.test(origin);

      if (isAllowed) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Access-Control-Allow-Credentials", "true");
        headers.set("Vary", "Origin");
      }
    }

    await maybeIssueAuthCoreSession(request, headers);
    stripAuthJsCookies(headers);

    const response = new Response(authResponse.body, {
      status: authResponse.status,
      statusText: authResponse.statusText,
      headers,
    });

    return response;
  } catch (error) {
    console.error("Auth.js handler error:", error);
    return c.json(
      {
        error: "Authentication error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

export { authApp, maybeIssueAuthCoreSession };

async function maybeIssueAuthCoreSession(request: Request, headers: Headers) {
  // Only run for Auth.js callbacks/signin endpoints that set the session cookie.
  const isMagicLinkSignin =
    request.url.includes(emailProviderPath) || request.url.includes(encodedEmailProviderPath);
  const isCredentialsCallback =
    request.url.includes(credentialsCallbackPath) || request.url.includes(encodedCredentialsCallbackPath);

  if (!request.url.includes("/callback/") && !isMagicLinkSignin && !isCredentialsCallback) {
    return null;
  }

  let sessionToken: string | null = null;

  // Robustly extract cookie (handling multiple Set-Cookie headers)
  if ('getSetCookie' in headers && typeof headers.getSetCookie === 'function') {
    const cookies = headers.getSetCookie();
    for (const cookie of cookies) {
      const match = cookie.match(/authjs\.session-token=([^;]+)/);
      if (match && match[1]) {
        sessionToken = decodeURIComponent(match[1]);
        break;
      }
    }
  } else {
    // Fallback for environments without getSetCookie
    const setCookieHeader = headers.get("set-cookie");
    if (setCookieHeader) {
      const match = setCookieHeader.match(/authjs\.session-token=([^;]+)/);
      if (match && match[1]) {
        sessionToken = decodeURIComponent(match[1]);
      }
    }
  }

  if (!sessionToken) {
    return null;
  }

  let sessionId: string | null = null;
  let userId: string | null = null;
  let expiresAt: Date | null = null;

  // 1. Try to parse as opaque token (legacy/database strategy)
  const parsed = parseOpaqueToken(sessionToken);
  if (parsed) {
    const sessionRecord = await prisma.session.findUnique({
      where: { tokenId: parsed.tokenId },
      include: {
        user: true,
      },
    });

    if (
      sessionRecord &&
      !sessionRecord.revokedAt &&
      sessionRecord.expiresAt > new Date() &&
      sessionRecord.user &&
      sessionRecord.sessionTokenHash &&
      verifyTokenSecret(parsed.tokenSecret, sessionRecord.sessionTokenHash as TokenHashEnvelope)
    ) {
      sessionId = sessionRecord.id;
      userId = sessionRecord.userId;
      expiresAt = sessionRecord.expiresAt;
    }
  }

  // 2. Try to verify as JWT (AuthCore Access Token strategy)
  if (!sessionId) {
    try {
      const authContext = await authService.verifyRequest({
        authorizationHeader: `Bearer ${sessionToken}`,
        method: request.method,
        url: request.url,
      });

      if (authContext && authContext.sessionId) {
        sessionId = authContext.sessionId;
        userId = authContext.userId;
        // We don't have the exact expiresAt from context, but we can look up the session if needed.
        // For refresh token issuance, we need the session to exist.
        // Let's verify the session exists in DB to get its expiry.
        const session = await prisma.session.findUnique({
          where: { id: sessionId },
        });
        if (session) {
          expiresAt = session.expiresAt;
        }
      }
    } catch (error) {
      // Ignore JWT verification errors (it might be an invalid opaque token)
    }
  }

  if (!sessionId || !userId || !expiresAt) {
    return null;
  }

  const ipAddress = extractIpFromRequest(request) ?? undefined;
  const userAgent = request.headers.get("user-agent") ?? undefined;

  // Issue Refresh Token for the EXISTING session.
  // We do not create a new session, as Auth.js (via persistSessionToken) or AuthCore already created one.
  const refreshResult = await authService.issueRefreshToken({
    userId,
    sessionId,
    expiresAt,
    metadata: {
      source: "authjs-callback",
      clientType: "web",
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    },
  });

  // Set refresh + CSRF cookies to let SPA call /auth/refresh and fetch access token.
  const csrfCookieValue = appendRefreshCookies(headers, refreshResult.refreshToken, refreshResult.token.expiresAt);

  // Also issue an access token header to allow non-SPA clients to bootstrap quickly.
  // If the sessionToken was already a JWT, this is redundant but harmless.
  // If it was opaque, this provides the JWT.
  const { token: accessToken, claims } = await generateAccessToken({
    userId,
    sessionId,
    clientType: "web",
    mfaLevel: "none", // Assuming none for now, could derive from session
    reauthenticatedAt: Math.floor(Date.now() / 1000),
  });
  headers.set("X-Access-Token", accessToken);
  headers.set("X-Access-Token-Expires-In", String(claims.exp - claims.iat));
  if (csrfCookieValue) {
    headers.set("X-Refresh-Csrf", csrfCookieValue);
  }

  return {
    sessionId,
    userId,
  };
}

function appendRefreshCookies(headers: Headers, refreshToken: string, expiresAt: Date): string | null {
  const csrfToken = randomUUID();
  const refreshCookie = buildRefreshCookie(refreshToken, expiresAt);
  const csrfCookie = buildCsrfCookie(csrfToken, expiresAt);
  headers.append("Set-Cookie", refreshCookie);
  headers.append("Set-Cookie", csrfCookie);
  return csrfToken;
}

function buildRefreshCookie(value: string, expiresAt: Date): string {
  const options = buildCookieOptions(expiresAt);
  return serializeCookie(REFRESH_TOKEN_COOKIE, value, options);
}

function buildCsrfCookie(csrfToken: string, expiresAt: Date): string {
  const options = buildCookieOptions(expiresAt);
  // CSRF cookie must be readable by JS.
  options.httpOnly = false;
  options.path = "/";
  return serializeCookie(REFRESH_CSRF_COOKIE, csrfToken, options);
}

type CookieOptions = {
  path?: string;
  httpOnly?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  secure?: boolean;
  domain?: string;
  maxAge?: number;
  expires?: Date;
};

function buildCookieOptions(expiresAt?: Date, maxAgeOverride?: number): CookieOptions {
  const sameSiteEnv = process.env.AUTH_COOKIE_SAMESITE;
  // Default to Lax for localhost (secure None cookies are often blocked over http)
  const sameSite: NonNullable<CookieOptions["sameSite"]> =
    sameSiteEnv === undefined || sameSiteEnv === ""
      ? "Lax"
      : (sameSiteEnv as NonNullable<CookieOptions["sameSite"]>);
  const secure = USE_HOST_PREFIX || process.env.AUTH_COOKIE_SECURE === "true";
  const domainEnv = process.env.AUTH_COOKIE_DOMAIN;
  // __Host- cookies must not set Domain, so skip when the prefix is active.
  const domain = USE_HOST_PREFIX ? undefined : domainEnv;
  const path = REFRESH_COOKIE_PATH;
  const maxAge =
    maxAgeOverride !== undefined
      ? maxAgeOverride
      : expiresAt
        ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
        : SESSION_MAX_AGE_SECONDS;

  return {
    path,
    httpOnly: true,
    sameSite,
    secure,
    ...(domain ? { domain } : {}),
    ...(maxAge !== undefined ? { maxAge } : {}),
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}

function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const segments = [`${name}=${encodeURIComponent(value)}`];
  if (options.domain) segments.push(`Domain=${options.domain}`);
  if (options.path) segments.push(`Path=${options.path}`);
  if (options.expires) segments.push(`Expires=${options.expires.toUTCString()}`);
  if (options.maxAge !== undefined) segments.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  segments.push(`SameSite=${options.sameSite ?? "Lax"}`);
  if (options.secure) segments.push("Secure");
  if (options.httpOnly) segments.push("HttpOnly");
  return segments.join("; ");
}

function stripAuthJsCookies(headers: Headers) {
  const isAuthJsCookie = (cookie: string) => {
    const lower = cookie.toLowerCase();
    return (
      lower.startsWith("authjs.session-token=") ||
      lower.startsWith("__secure-authjs.session-token=") ||
      lower.startsWith("__host-authjs.session-token=") ||
      lower.startsWith("authjs.csrf-token=") ||
      lower.startsWith("__host-authjs.csrf-token=")
    );
  };

  if ("getSetCookie" in headers && typeof headers.getSetCookie === "function") {
    const filtered = headers.getSetCookie().filter((cookie: string) => !isAuthJsCookie(cookie));
    headers.delete("set-cookie");
    for (const cookie of filtered) {
      headers.append("Set-Cookie", cookie);
    }
    return;
  }

  const raw = headers.get("set-cookie");
  if (!raw) {
    return;
  }

  const parts = raw.split(/,(?=[^;]+=[^;]+)/);
  const filtered = parts.filter((cookie) => !isAuthJsCookie(cookie.trim()));
  headers.delete("set-cookie");
  for (const cookie of filtered) {
    headers.append("Set-Cookie", cookie.trim());
  }
}



function extractIpFromRequest(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const [first] = forwarded.split(",");
    if (first?.trim()) {
      return first.trim();
    }
  }
  const realIp = request.headers.get("x-real-ip");
  return realIp ?? undefined;
}

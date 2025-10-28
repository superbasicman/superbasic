/**
 * Auth.js Handler for Hono
 *
 * Custom integration using @auth/core since @auth/hono doesn't exist.
 * This handler wraps Auth.js to work with Hono's Web standard Request/Response APIs.
 */

import { Hono } from "hono";
import { Auth } from "@auth/core";
import { authConfig } from "@repo/auth";
import { magicLinkRateLimitMiddleware } from "./middleware/rate-limit.js";
import { corsMiddleware } from "./middleware/cors.js";

const authApp = new Hono();

// Apply CORS middleware to auth routes (sub-apps don't inherit parent middleware)
authApp.use("/*", corsMiddleware);

// Apply magic link rate limiting (3 req/hour per email) before Auth.js handler
// Auth.js uses "nodemailer" as the provider ID for email authentication
authApp.use("/signin/nodemailer", magicLinkRateLimitMiddleware);

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
    // Get the original request
    const request = c.req.raw;

    // Skip Auth.js for OPTIONS requests - let CORS middleware handle them
    // This prevents Auth.js from trying to redirect preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    console.log("[Auth.js Handler] Request:", {
      method: request.method,
      url: request.url,
      contentType: request.headers.get("content-type"),
      origin: request.headers.get("origin"),
    });

    // Call Auth.js with the request and config
    const authResponse = await Auth(request, authConfig);

    // Auth.js returns a new Response without CORS headers
    // We need to add them manually for cross-origin cookie support
    const origin = request.headers.get("origin");
    const headers = new Headers(authResponse.headers);
    
    if (origin) {
      // Check if origin is allowed (same logic as CORS middleware)
      const isAllowed = 
        origin === "https://app.superbasicfinance.com" ||
        /^https:\/\/.*\.vercel\.app$/.test(origin) ||
        /^http:\/\/localhost:\d+$/.test(origin);
      
      if (isAllowed) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Access-Control-Allow-Credentials", "true");
        headers.set("Vary", "Origin");
      }
    }

    const response = new Response(authResponse.body, {
      status: authResponse.status,
      statusText: authResponse.statusText,
      headers,
    });

    // Log Set-Cookie headers and CORS headers for debugging
    const setCookieHeaders = response.headers.getSetCookie?.() || [];
    console.log("[Auth.js Handler] Response:", {
      status: response.status,
      location: response.headers.get("location"),
      setCookieCount: setCookieHeaders.length,
      setCookies: setCookieHeaders.map((c) => c.substring(0, 50) + "..."),
      corsHeaders: {
        accessControlAllowOrigin: response.headers.get("access-control-allow-origin"),
        accessControlAllowCredentials: response.headers.get("access-control-allow-credentials"),
      },
    });

    // For sign-out requests with JWT strategy, Auth.js doesn't clear the cookie by default
    // We need to manually add a Set-Cookie header to clear it
    if (request.url.includes("/signout") && response.status === 302) {
      // Clone the response to modify headers
      const headers = new Headers(response.headers);

      // Add Set-Cookie header to clear the session cookie
      const cookieName = "authjs.session-token";
      const clearCookie = `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
      headers.append("Set-Cookie", clearCookie);

      // Return new response with updated headers
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    // Return the Auth.js response
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

export { authApp };

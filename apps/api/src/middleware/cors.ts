import { cors } from "hono/cors";

/**
 * CORS middleware for cross-origin cookie support
 * 
 * Configuration:
 * - Specific origins (not wildcard) required for credentials: true
 * - credentials: true allows cookies to be sent cross-origin
 * - Hono automatically sets Vary: Origin header for proper caching
 * 
 * How it works:
 * - Host-only cookie on api.superbasicfinance.com is sent when web client
 *   at app.superbasicfinance.com makes requests with credentials: "include"
 * - CORS with credentials: true allows the browser to send and accept cookies
 *   despite different subdomains
 */
export const corsMiddleware = cors({
  origin: (origin) => {
    // Allow production domain
    if (origin === "https://app.superbasicfinance.com") {
      return origin;
    }
    
    // Allow Vercel preview deployments (e.g., https://sbfin-web-abc123.vercel.app)
    if (origin && /^https:\/\/.*\.vercel\.app$/.test(origin)) {
      return origin;
    }
    
    // Allow localhost for development
    if (origin && /^http:\/\/localhost:\d+$/.test(origin)) {
      return origin;
    }
    
    // Reject all other origins
    return "";
  },
  credentials: true, // Required for cookies
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400, // 24 hours - browser caches preflight response
});

import { cors } from "hono/cors";

// Get allowed origins from environment
const webAppUrl = process.env.WEB_APP_URL || "http://localhost:5173";

// Parse the web app URL to allow both with and without www
const allowedOrigins = new Set<string>();
allowedOrigins.add(webAppUrl);

// If the web app URL has www, also allow without www (and vice versa)
try {
  const url = new URL(webAppUrl);
  if (url.hostname.startsWith("www.")) {
    const withoutWww = `${url.protocol}//${url.hostname.replace(/^www\./, "")}${
      url.port ? `:${url.port}` : ""
    }`;
    allowedOrigins.add(withoutWww);
  } else if (!url.hostname.includes("localhost")) {
    const withWww = `${url.protocol}//www.${url.hostname}${
      url.port ? `:${url.port}` : ""
    }`;
    allowedOrigins.add(withWww);
  }
} catch (error) {
  console.warn("Failed to parse WEB_APP_URL for CORS configuration:", error);
}

export const corsMiddleware = cors({
  origin: (origin) => {
    // Allow configured web app URL (and www variant)
    if (origin && allowedOrigins.has(origin)) {
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
  exposeHeaders: ["Set-Cookie"], // Allow browser to read Set-Cookie headers
  maxAge: 86400, // 24 hours - browser caches preflight response
});

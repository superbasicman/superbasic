import { cors } from "hono/cors";

export function computeAllowedOrigins(): Set<string> {
  const webAppUrl = process.env.WEB_APP_URL || "http://localhost:5173";
  const allowed = new Set<string>();
  allowed.add(webAppUrl);

  try {
    const url = new URL(webAppUrl);
    if (url.hostname.startsWith("www.")) {
      const withoutWww = `${url.protocol}//${url.hostname.replace(/^www\./, "")}${
        url.port ? `:${url.port}` : ""
      }`;
      allowed.add(withoutWww);
    } else if (!url.hostname.includes("localhost")) {
      const withWww = `${url.protocol}//www.${url.hostname}${
        url.port ? `:${url.port}` : ""
      }`;
      allowed.add(withWww);
    }
  } catch (error) {
    console.warn("Failed to parse WEB_APP_URL for CORS configuration:", error);
  }

  return allowed;
}

const allowedOrigins = computeAllowedOrigins();

export const corsMiddleware = cors({
  origin: (origin) => {
    // Allow configured web app URL (and www variant)
    if (origin && allowedOrigins.has(origin)) {
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
  allowHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Requested-With"],
  exposeHeaders: ["Set-Cookie"], // Allow browser to read Set-Cookie headers
  maxAge: 86400, // 24 hours - browser caches preflight response
});

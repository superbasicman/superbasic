import type { Context, Next } from "hono";
import { randomUUID } from "node:crypto";

/**
 * Request ID middleware
 * Generates a unique request ID for each request and attaches it to the context
 * The request ID is used for log correlation and audit trails
 */
export async function requestIdMiddleware(c: Context, next: Next) {
  // Check if request ID is already set (e.g., from load balancer)
  const existingRequestId =
    c.req.header("x-request-id") || c.req.header("x-correlation-id");

  // Generate new request ID if not present
  const requestId = existingRequestId || randomUUID();

  // Attach to context for use in handlers
  c.set("requestId", requestId);

  // Add to response headers for client correlation
  c.header("x-request-id", requestId);

  await next();
}

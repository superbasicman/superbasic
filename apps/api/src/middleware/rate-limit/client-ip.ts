import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { isIP } from 'node:net';

function normalizeIp(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed && isIP(trimmed) ? trimmed : null;
}

function parseTrustedProxyIps(): Set<string> {
  const raw = process.env.AUTH_TRUSTED_PROXY_IPS;
  if (!raw) {
    return new Set();
  }

  const entries = raw
    .split(',')
    .map(entry => normalizeIp(entry))
    .filter((entry): entry is string => Boolean(entry));

  return new Set(entries);
}

function getRemoteAddress(c: Context): string | null {
  try {
    const connInfo = getConnInfo(c as unknown as any);
    return normalizeIp(connInfo?.remote?.address);
  } catch {
    // getConnInfo will throw outside the node-server runtime (e.g., unit tests)
    return null;
  }
}

function getHeaderIp(c: Context): string | null {
  const realIp = normalizeIp(c.req.header('x-real-ip'));
  if (realIp) {
    return realIp;
  }

  const forwardedFor = c.req.header('x-forwarded-for');
  if (!forwardedFor) {
    return null;
  }

  // Use the first IP in the list (closest to the client)
  const firstIp = forwardedFor.split(',')[0]?.trim();
  return normalizeIp(firstIp);
}

/**
 * Resolve the client IP in a proxy-aware but safe way.
 *
 * - Uses the immediate connection IP by default (non-spoofable).
 * - If the connection IP is in AUTH_TRUSTED_PROXY_IPS, trusts X-Real-IP /
 *   the first entry in X-Forwarded-For.
 * - Falls back to "unknown" when no signal is available.
 */
export function resolveClientIp(c: Context): string {
  const remoteIp = getRemoteAddress(c);
  const trustedProxies = parseTrustedProxyIps();
  const headerIp = getHeaderIp(c);

  if (remoteIp && trustedProxies.has(remoteIp) && headerIp) {
    return headerIp;
  }

  if (remoteIp) {
    return remoteIp;
  }

  // In environments without connection info (e.g., some tests), allow header use
  // only if trusted proxies are explicitly configured.
  if (!remoteIp && headerIp && trustedProxies.size > 0) {
    return headerIp;
  }

  return 'unknown';
}

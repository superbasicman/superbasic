import { randomUUID } from 'node:crypto';
import { setCookie, getCookie } from 'hono/cookie';
import type { Context } from 'hono';
import type { CookieOptions } from 'hono/utils/cookie';

import {
  REFRESH_COOKIE_PATH,
  REFRESH_CSRF_COOKIE,
  REFRESH_TOKEN_COOKIE,
  USE_HOST_PREFIX,
} from '../../../lib/refresh-cookie-constants.js';

export {
  REFRESH_CSRF_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '../../../lib/refresh-cookie-constants.js';

function buildCookieOptions(expiresAt?: Date, maxAgeOverride?: number): CookieOptions {
  const sameSiteEnv = process.env.AUTH_COOKIE_SAMESITE;
  const sameSite: NonNullable<CookieOptions['sameSite']> =
    sameSiteEnv === undefined || sameSiteEnv === ''
      ? 'Lax'
      : (sameSiteEnv as NonNullable<CookieOptions['sameSite']>);
  const secure = USE_HOST_PREFIX || process.env.AUTH_COOKIE_SECURE === 'true';
  // __Host- cookies must omit Domain.
  const domain = USE_HOST_PREFIX ? undefined : process.env.AUTH_COOKIE_DOMAIN;
  const maxAge =
    maxAgeOverride !== undefined
      ? maxAgeOverride
      : expiresAt
        ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
        : undefined;

  return {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    sameSite,
    secure,
    ...(domain ? { domain } : {}),
    ...(maxAge !== undefined ? { maxAge } : {}),
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}

function buildCsrfCookieOptions(expiresAt?: Date, maxAgeOverride?: number): CookieOptions {
  const base = buildCookieOptions(expiresAt, maxAgeOverride);
  return {
    ...base,
    httpOnly: false, // Must be readable by browser JS to echo in header
    path: '/', // Allow SPA to read and send on refresh/logout requests
  };
}

export function setRefreshTokenCookie(c: Context, token: string, expiresAt: Date): string {
  const csrfToken = randomUUID();
  setCookie(c, REFRESH_TOKEN_COOKIE, token, buildCookieOptions(expiresAt));
  setCookie(c, REFRESH_CSRF_COOKIE, csrfToken, buildCsrfCookieOptions(expiresAt));
  return csrfToken;
}

export function getRefreshTokenFromCookie(c: Context): string | null {
  try {
    return getCookie(c, REFRESH_TOKEN_COOKIE) ?? null;
  } catch {
    return null;
  }
}

export function getRefreshCsrfFromCookie(c: Context): string | null {
  try {
    return getCookie(c, REFRESH_CSRF_COOKIE) ?? null;
  } catch {
    return null;
  }
}

export function clearRefreshTokenCookie(c: Context): void {
  setCookie(c, REFRESH_TOKEN_COOKIE, '', buildCookieOptions(undefined, 0));
  setCookie(c, REFRESH_CSRF_COOKIE, '', buildCsrfCookieOptions(undefined, 0));
}

/**
 * Validate CSRF token for refresh/logout endpoints that rely on the refresh cookie.
 * Returns true if the non-HttpOnly CSRF cookie matches the X-CSRF-Token header.
 */
export function validateRefreshCsrf(c: Context): boolean {
  const cookieToken = getRefreshCsrfFromCookie(c);
  const headerToken = c.req.header('x-csrf-token');
  if (!cookieToken || !headerToken) {
    return false;
  }
  return headerToken === cookieToken;
}

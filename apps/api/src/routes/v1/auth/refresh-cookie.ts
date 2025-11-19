import { setCookie, getCookie } from 'hono/cookie';
import type { Context } from 'hono';

export const REFRESH_TOKEN_COOKIE = 'sb.refresh-token';
const REFRESH_COOKIE_PATH = '/v1/auth/refresh';
const isProduction = process.env.NODE_ENV === 'production';

export function setRefreshTokenCookie(
  c: Context,
  token: string,
  expiresAt: Date
): void {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

  setCookie(c, REFRESH_TOKEN_COOKIE, token, {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    sameSite: 'Strict',
    secure: isProduction,
    maxAge,
    expires: expiresAt,
  });
}

export function getRefreshTokenFromCookie(c: Context): string | null {
  try {
    return getCookie(c, REFRESH_TOKEN_COOKIE) ?? null;
  } catch {
    return null;
  }
}

export function clearRefreshTokenCookie(c: Context): void {
  setCookie(c, REFRESH_TOKEN_COOKIE, '', {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    sameSite: 'Strict',
    secure: isProduction,
    maxAge: 0,
  });
}

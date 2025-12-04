import { randomBytes } from 'node:crypto';
import type { Context, Next } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { COOKIE_NAME } from '@repo/auth';

const CSRF_COOKIE_NAME = 'CSRF-Token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCsrfToken(): string {
    return randomBytes(32).toString('base64url');
}

/**
 * Set CSRF token cookie for double-submit pattern
 * 
 * The token is set in a non-HttpOnly cookie so JavaScript can read it
 * and send it back in the X-CSRF-Token header.
 */
export function setCsrfCookie(c: Context, token: string): void {
    setCookie(c, CSRF_COOKIE_NAME, token, {
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: false, // Client needs to read this
        sameSite: 'Strict',
        maxAge: 30 * 24 * 60 * 60, // 30 days, matches session
    });
}

/**
 * CSRF protection middleware using double-submit cookie pattern
 * 
 * Only validates CSRF for:
 * - Cookie-based authentication (has session cookie)
 * - No Authorization header (mobile/API clients exempt)
 * - Mutation methods (POST, PUT, PATCH, DELETE)
 * 
 * Mobile apps using Bearer tokens are automatically exempt.
 */
export async function csrfProtection(c: Context, next: Next) {
    const method = c.req.method;

    // Only protect mutation methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        return next();
    }

    // Skip CSRF check if using Bearer token (mobile/API clients)
    const authHeader = c.req.header('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        return next();
    }

    // Skip CSRF check if no session cookie (not authenticated via cookie)
    const sessionCookie = getCookie(c, COOKIE_NAME);
    if (!sessionCookie) {
        return next();
    }

    // At this point: cookie-based auth + mutation method
    // CSRF validation required
    const csrfCookie = getCookie(c, CSRF_COOKIE_NAME);
    const csrfHeader = c.req.header(CSRF_HEADER_NAME);

    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        return c.json(
            {
                error: 'CSRF validation failed',
                message: 'Invalid or missing CSRF token',
            },
            403
        );
    }

    await next();
}

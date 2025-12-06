/**
 * Email Verification Middleware
 *
 * Checks if the authenticated user's email is verified
 * Returns 403 if not verified for protected routes
 */

import type { Context, Next } from 'hono';
import { userService } from '../services/index.js';
import type { AppBindings } from '../types/context.js';

/**
 * Paths that don't require email verification
 * These allow users to verify their email or manage their account
 */
const VERIFICATION_EXEMPT_PATHS = [
  '/v1/auth/verify-email',
  '/v1/auth/resend-verification',
  '/v1/auth/logout',
  '/v1/auth/session', // Needed to check verification status
  '/v1/auth/refresh',
  '/v1/health',
  '/health',
  '/.well-known',
];

/**
 * Check if the path is exempt from email verification
 */
function isExemptPath(path: string): boolean {
  return VERIFICATION_EXEMPT_PATHS.some((exemptPath) =>
    path.startsWith(exemptPath)
  );
}

/**
 * Middleware that requires email verification for authenticated users
 * Returns 403 if the user is authenticated but email is not verified
 */
export async function requireVerifiedEmail(
  c: Context<AppBindings>,
  next: Next
) {
  const path = new URL(c.req.url).pathname;

  // Skip check for exempt paths
  if (isExemptPath(path)) {
    return next();
  }

  const auth = c.get('auth');

  // Skip if no auth context (handled by other middleware)
  if (!auth?.userId) {
    return next();
  }

  // Check email verification status via service layer
  const isVerified = await userService.isEmailVerified(auth.userId);

  if (!isVerified) {
    return c.json(
      {
        error: 'email_not_verified',
        message: 'Please verify your email address to continue.',
        code: 'EMAIL_VERIFICATION_REQUIRED',
      },
      403
    );
  }

  return next();
}

/**
 * Authentication constants
 * Single source of truth for auth configuration
 */

// Session configuration - single source of truth
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const SESSION_ABSOLUTE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60; // 180 days hard cap

// Cookie configuration
// Auth.js uses 'authjs.session-token' by default (or '__Secure-authjs.session-token' in production)
// We use the Auth.js default to maintain compatibility
export const COOKIE_NAME = "authjs.session-token";

// Password hashing
export const BCRYPT_SALT_ROUNDS = 10;

// JWT configuration
export const JWT_SALT = "authjs.session-token"; // Auth.js v5 default

// Clock skew tolerance for token validation
export const CLOCK_SKEW_TOLERANCE_SECONDS = 60;

// Provider identifiers (namespaced for Auth.js)
export const AUTHJS_CREDENTIALS_PROVIDER_ID = "authjs:credentials";
export const AUTHJS_GOOGLE_PROVIDER_ID = "authjs:google";
export const AUTHJS_EMAIL_PROVIDER_ID = "authjs:email";

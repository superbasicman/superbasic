/**
 * Authentication constants
 * Single source of truth for auth configuration
 */

// Session configuration - single source of truth
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

// Cookie configuration
export const COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-sbfin_auth" // __Host- prefix enforces Secure, Path=/, no Domain
    : "__sbfin_auth"; // Dev-friendly (works with http://localhost)

// Password hashing
export const BCRYPT_SALT_ROUNDS = 10;

// JWT configuration
export const JWT_SALT = "authjs.session-token"; // Auth.js v5 default

// Clock skew tolerance for token validation
export const CLOCK_SKEW_TOLERANCE_SECONDS = 60;

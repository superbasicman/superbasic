/**
 * Authentication constants
 * Single source of truth for auth configuration
 */

// Session configuration - single source of truth
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const SESSION_ABSOLUTE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60; // 180 days hard cap

// Cookie configuration
// We use 'sb.session-token' for SuperBasic Finance sessions
export const COOKIE_NAME = 'sb.session-token';

// Password hashing
export const BCRYPT_SALT_ROUNDS = 10;

// JWT configuration
export const JWT_SALT = 'sb.session-token';

// Clock skew tolerance for token validation
export const CLOCK_SKEW_TOLERANCE_SECONDS = 60;

// Provider identifiers matching IdentityProvider enum
export const LOCAL_PASSWORD_PROVIDER_ID = 'local_password';
export const LOCAL_MAGIC_LINK_PROVIDER_ID = 'local_magic_link';
export const GOOGLE_PROVIDER_ID = 'google';
export const GITHUB_PROVIDER_ID = 'github';

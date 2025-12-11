/**
 * @repo/auth
 *
 * Authentication primitives for SuperBasic Finance
 * - Password hashing/verification
 * - Auth constants (cookie name, salts, provider IDs)
 * - Session schema parsing
 *
 * All higher-order auth flows live in @repo/auth-core.
 */

// Password utilities
export { hashPassword, verifyPassword } from './password.js';

// Constants
export {
  SESSION_MAX_AGE_SECONDS,
  SESSION_ABSOLUTE_MAX_AGE_SECONDS,
  COOKIE_NAME,
  BCRYPT_SALT_ROUNDS,
  JWT_SALT,
  CLOCK_SKEW_TOLERANCE_SECONDS,
  LOCAL_PASSWORD_PROVIDER_ID,
  LOCAL_MAGIC_LINK_PROVIDER_ID,
  GOOGLE_PROVIDER_ID,
  GITHUB_PROVIDER_ID,
} from './constants.js';

// Session typing & runtime validation
export { AuthSessionSchema, parseAuthSession } from './session-schema.js';
export type { AuthSession } from './session-schema.js';

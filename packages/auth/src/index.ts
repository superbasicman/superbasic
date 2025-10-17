/**
 * @repo/auth
 *
 * Authentication utilities for SuperBasic Finance
 * - Auth.js configuration and adapters
 * - Personal Access Token (PAT) hashing and verification
 * - Role-Based Access Control (RBAC) scope definitions
 */

// Auth.js configuration
export { authConfig } from "./config.js";

// Password utilities
export { hashPassword, verifyPassword } from "./password.js";

// Authentication events
export { authEvents } from "./events.js";
export type { AuthEvent, AuthEventType, AuthEventHandler } from "./events.js";

// Constants
export {
  SESSION_MAX_AGE_SECONDS,
  COOKIE_NAME,
  BCRYPT_SALT_ROUNDS,
  JWT_SALT,
  CLOCK_SKEW_TOLERANCE_SECONDS,
} from "./constants.js";

// PAT and RBAC (existing exports)
export * from "./pat.js";
export * from "./rbac.js";

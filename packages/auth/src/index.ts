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
export type {
  AuthEvent,
  AuthEventType,
  AuthEventHandler,
  TokenCreatedEvent,
  TokenUsedEvent,
  TokenRevokedEvent,
  TokenAuthFailedEvent,
  TokenScopeDeniedEvent,
} from "./events.js";

// Constants
export {
  SESSION_MAX_AGE_SECONDS,
  COOKIE_NAME,
  BCRYPT_SALT_ROUNDS,
  JWT_SALT,
  CLOCK_SKEW_TOLERANCE_SECONDS,
} from "./constants.js";

// PAT utilities
export {
  generateToken,
  hashToken,
  verifyToken,
  isValidTokenFormat,
  extractTokenFromHeader,
} from "./pat.js";

// RBAC and scope utilities
export {
  VALID_SCOPES,
  isValidScope,
  validateScopes,
  hasScope,
  hasAllScopes,
  hasAnyScope,
  RBAC_SCOPES,
  RBAC_ROLES,
} from "./rbac.js";
export type { Scope, RBACScope, RBACRole } from "./rbac.js";

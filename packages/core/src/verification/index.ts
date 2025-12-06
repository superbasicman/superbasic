/**
 * Verification Domain
 *
 * Public exports for email verification management
 */

// Repository layer
export { VerificationRepository } from './verification-repository.js';
export type { CreateVerificationTokenData } from './verification-repository.js';

// Service layer
export { VerificationService } from './verification-service.js';

// Domain types
export type {
  CreateVerificationTokenParams,
  CreateVerificationTokenResult,
  VerifyEmailTokenParams,
  VerifyEmailTokenResult,
  ResendVerificationParams,
} from './verification-types.js';

// Domain errors
export {
  VerificationError,
  TokenExpiredError,
  TokenInvalidError,
  TokenAlreadyConsumedError,
  UserNotFoundForVerificationError,
  EmailAlreadyVerifiedError,
} from './verification-errors.js';

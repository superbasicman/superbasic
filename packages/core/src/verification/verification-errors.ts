/**
 * Verification Domain Errors
 *
 * Custom error classes for verification business rule violations
 * These errors are thrown by the service layer and mapped to HTTP status codes by route handlers
 */

export class VerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VerificationError';
  }
}

export class TokenExpiredError extends VerificationError {
  constructor() {
    super('Verification token has expired');
    this.name = 'TokenExpiredError';
  }
}

export class TokenInvalidError extends VerificationError {
  constructor() {
    super('Verification token is invalid');
    this.name = 'TokenInvalidError';
  }
}

export class TokenAlreadyConsumedError extends VerificationError {
  constructor() {
    super('Verification token has already been used');
    this.name = 'TokenAlreadyConsumedError';
  }
}

export class UserNotFoundForVerificationError extends VerificationError {
  constructor() {
    super('No pending verification found');
    this.name = 'UserNotFoundForVerificationError';
  }
}

export class EmailAlreadyVerifiedError extends VerificationError {
  constructor() {
    super('Email is already verified');
    this.name = 'EmailAlreadyVerifiedError';
  }
}

/**
 * User Domain Errors
 * 
 * Custom error classes for user-related business rule violations.
 */

export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

export class DuplicateEmailError extends UserError {
  constructor(email: string) {
    super(`Email already in use: ${email}`);
    this.name = 'DuplicateEmailError';
  }
}

export class InvalidEmailError extends UserError {
  constructor(email: string) {
    super(`Invalid email format: ${email}`);
    this.name = 'InvalidEmailError';
  }
}

export class WeakPasswordError extends UserError {
  constructor(reason: string) {
    super(`Password does not meet requirements: ${reason}`);
    this.name = 'WeakPasswordError';
  }
}

/**
 * Profile Domain Errors
 * 
 * Custom error classes for profile-related business rule violations.
 */

export class ProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileError';
  }
}

export class ProfileNotFoundError extends ProfileError {
  constructor(userId: string) {
    super(`Profile not found for user: ${userId}`);
    this.name = 'ProfileNotFoundError';
  }
}

export class InvalidProfileDataError extends ProfileError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProfileDataError';
  }
}

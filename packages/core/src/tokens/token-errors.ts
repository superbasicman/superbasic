/**
 * Token Domain Errors
 *
 * Custom error classes for token business rule violations
 * These errors are thrown by the service layer and mapped to HTTP status codes by route handlers
 */

export class TokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenError';
  }
}

export class DuplicateTokenNameError extends TokenError {
  constructor(name: string) {
    super(`Token name "${name}" already exists`);
    this.name = 'DuplicateTokenNameError';
  }
}

export class InvalidScopesError extends TokenError {
  constructor(scopes: string[]) {
    super(`Invalid scopes: ${scopes.join(', ')}`);
    this.name = 'InvalidScopesError';
  }
}

export class InvalidExpirationError extends TokenError {
  constructor(days: number) {
    super(`Expiration must be between 1-365 days, got ${days}`);
    this.name = 'InvalidExpirationError';
  }
}

export class TokenNotFoundError extends TokenError {
  constructor(id: string) {
    super(`Token not found: ${id}`);
    this.name = 'TokenNotFoundError';
  }
}

export class TokenRevokedError extends TokenError {
  constructor(id: string) {
    super(`Token has been revoked: ${id}`);
    this.name = 'TokenRevokedError';
  }
}

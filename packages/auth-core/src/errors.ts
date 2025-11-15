export class AuthCoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AuthCoreError {
  constructor(message = 'Unauthorized', options?: ErrorOptions) {
    super(message, options);
  }
}

export class AuthorizationError extends AuthCoreError {
  constructor(message = 'Forbidden', options?: ErrorOptions) {
    super(message, options);
  }
}

export class InactiveUserError extends AuthorizationError {
  constructor(message = 'User is not active', options?: ErrorOptions) {
    super(message, options);
  }
}

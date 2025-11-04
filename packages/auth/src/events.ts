/**
 * Authentication event emitter for audit logging and monitoring
 * Events are fire-and-forget to avoid blocking the authentication flow
 */

export type AuthEventType =
  | "user.registered"
  | "user.login.success"
  | "user.login.failed"
  | "user.logout"
  | "token.created"
  | "token.used"
  | "token.revoked"
  | "token.auth_failed"
  | "token.scope_denied"
  | "auth.failed_rate_limited";

/**
 * Base authentication event structure
 */
export interface AuthEvent {
  type: AuthEventType;
  userId?: string;
  email?: string;
  ip?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Token creation event payload
 * Emitted when a new API token is created
 */
export interface TokenCreatedEvent extends Omit<AuthEvent, "type"> {
  type: "token.created";
  userId: string;
  metadata: {
    tokenId: string;
    profileId?: string | null;
    workspaceId?: string | null;
    tokenName: string;
    scopes: string[];
    expiresAt: string | null;
    ip: string;
    userAgent: string;
    timestamp: string;
  };
}

/**
 * Token usage event payload
 * Emitted when a token is successfully used to authenticate a request
 */
export interface TokenUsedEvent extends Omit<AuthEvent, "type"> {
  type: "token.used";
  userId: string;
  metadata: {
    tokenId: string;
    endpoint: string;
    method: string;
    status: number;
    ip: string;
    userAgent: string;
    timestamp: string;
  };
}

/**
 * Token revocation event payload
 * Emitted when a token is revoked by the user
 */
export interface TokenRevokedEvent extends Omit<AuthEvent, "type"> {
  type: "token.revoked";
  userId: string;
  metadata: {
    tokenId: string;
    profileId?: string | null;
    workspaceId?: string | null;
    tokenName: string;
    ip: string;
    userAgent: string;
    timestamp: string;
  };
}

/**
 * Token authentication failure event payload
 * Emitted when token authentication fails (invalid, expired, revoked, etc.)
 */
export interface TokenAuthFailedEvent extends Omit<AuthEvent, "type"> {
  type: "token.auth_failed";
  userId?: string;
  metadata: {
    reason: "invalid_format" | "not_found" | "revoked" | "expired";
    tokenPrefix?: string;
    tokenId?: string;
    expiresAt?: string;
    ip: string;
    userAgent: string;
    timestamp: string;
  };
}

/**
 * Token scope denial event payload
 * Emitted when a token lacks required scope for an operation
 */
export interface TokenScopeDeniedEvent extends Omit<AuthEvent, "type"> {
  type: "token.scope_denied";
  userId: string;
  metadata: {
    tokenId: string;
    endpoint: string;
    method: string;
    requiredScope: string;
    providedScopes: string[];
    ip: string;
    userAgent: string;
    timestamp: string;
  };
}

export interface AuthFailedRateLimitedEvent extends Omit<AuthEvent, "type"> {
  type: "auth.failed_rate_limited";
  metadata: {
    ip: string;
    windowSeconds: number;
    maxAttempts: number;
    attemptsRecorded: number;
    timestamp: string;
  };
}

export type AuthEventHandler = (event: AuthEvent) => void | Promise<void>;

class AuthEventEmitter {
  private handlers: AuthEventHandler[] = [];

  on(handler: AuthEventHandler) {
    this.handlers.push(handler);
  }

  async emit(event: Omit<AuthEvent, "timestamp">) {
    const fullEvent: AuthEvent = {
      ...event,
      timestamp: new Date(),
    };

    // Fire and forget - don't block auth flow
    Promise.all(this.handlers.map((h) => h(fullEvent))).catch((err) => {
      console.error("Auth event handler error:", err);
    });
  }

  /**
   * Clear all event handlers
   * Useful for testing to prevent handler accumulation
   */
  clearHandlers() {
    this.handlers = [];
  }
}

export const authEvents = new AuthEventEmitter();

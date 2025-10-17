/**
 * Authentication event emitter for audit logging and monitoring
 * Events are fire-and-forget to avoid blocking the authentication flow
 */

export type AuthEventType =
  | "user.registered"
  | "user.login.success"
  | "user.login.failed"
  | "user.logout";

export interface AuthEvent {
  type: AuthEventType;
  userId?: string;
  email?: string;
  ip?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
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
}

export const authEvents = new AuthEventEmitter();

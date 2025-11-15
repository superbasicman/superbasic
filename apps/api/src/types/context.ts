import type { AuthContext as CoreAuthContext } from '@repo/auth-core';

/**
 * Shared Hono context variables for API requests.
 * Includes legacy Auth.js bindings and the new auth-core context placeholder.
 */
export type ContextVariables = {
  requestId: string;
  userId: string;
  userEmail: string;
  jti?: string;
  profileId?: string;
  authType?: "session" | "pat";
  tokenId?: string;
  tokenScopes?: string[];
  auth: CoreAuthContext | null;
};

export type AppBindings = {
  Variables: ContextVariables;
};

declare module 'hono' {
  // Allow c.var / c.get access without casting everywhere
  interface ContextVariableMap extends ContextVariables {}
}

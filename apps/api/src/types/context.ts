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
  profileId?: string | null;
  authType?: "session" | "pat";
  workspaceId?: string | null;
  allowedWorkspaces?: string[];
  principalType?: "user" | "service";
  serviceId?: string | null;
  clientId?: string | null;
  tokenId?: string;
  tokenScopes?: string[];
  tokenScopesRaw?: string[];
  auth: CoreAuthContext | null;
};

export type AppBindings = {
  Variables: ContextVariables;
};

declare module 'hono' {
  // Allow c.var / c.get access without casting everywhere
  interface ContextVariableMap extends ContextVariables {}
}

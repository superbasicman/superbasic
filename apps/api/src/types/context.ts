/**
 * Shared Hono context types for middleware
 */

/**
 * Context variables set by auth middleware
 * 
 * - requestId: Unique request identifier for log correlation
 * - userId: Auth.js user ID (for authentication concerns)
 * - userEmail: User's email address
 * - jti: JWT ID (for token revocation) - only set for session auth
 * - profileId: Profile ID (for business logic and domain operations)
 * - authType: Authentication method used ("session" or "pat")
 * - tokenId: API key ID - only set for PAT auth
 * - tokenScopes: Array of permission scopes - only set for PAT auth
 */
export type AuthContext = {
  Variables: {
    requestId: string;
    userId: string;
    userEmail: string;
    jti?: string; // Only for session auth
    profileId?: string; // Optional because profile might not exist yet
    authType?: "session" | "pat";
    tokenId?: string; // Only for PAT auth
    tokenScopes?: string[]; // Only for PAT auth
  };
};

/**
 * Shared Hono context types for middleware
 */

/**
 * Context variables set by auth middleware
 * 
 * - userId: Auth.js user ID (for authentication concerns)
 * - userEmail: User's email address
 * - jti: JWT ID (for token revocation)
 * - profileId: Profile ID (for business logic and domain operations)
 */
export type AuthContext = {
  Variables: {
    userId: string;
    userEmail: string;
    jti: string;
    profileId?: string; // Optional because profile might not exist yet
  };
};

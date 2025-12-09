/**
 * Scope-gated user claims for token responses.
 * Only returns user data when openid scope is present.
 * Fields are gated by email and profile scopes per OIDC spec.
 */

import { userRepository } from '../services/index.js';

export type UserClaims = {
  id: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  createdAt: string;
};

type BuildUserClaimsOptions = {
  userId: string;
  scopes: string[];
};

/**
 * Build user claims for token response based on granted scopes.
 * Returns null if openid scope is not present.
 *
 * Scope mapping:
 * - openid: Required for any user data
 * - email: Includes email and email_verified
 * - profile: Includes name (displayName)
 */
export async function buildUserClaimsForTokenResponse(
  options: BuildUserClaimsOptions
): Promise<UserClaims | null> {
  const { userId, scopes } = options;

  // No user data without openid scope
  if (!scopes.includes('openid')) {
    return null;
  }

  const hasEmail = scopes.includes('email');
  const hasProfile = scopes.includes('profile');

  // Fetch id and createdAt always, other fields based on scopes
  const user = await userRepository.findById(userId);

  if (!user) {
    return null;
  }

  const claims: UserClaims = {
    id: user.id,
    createdAt: user.createdAt.toISOString(),
  };

  if (hasEmail && user.primaryEmail) {
    claims.email = user.primaryEmail;
    claims.email_verified = user.emailVerified ?? false;
  }

  if (hasProfile && user.displayName) {
    claims.name = user.displayName;
  }

  return claims;
}

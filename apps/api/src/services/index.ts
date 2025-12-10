/**
 * Service Registry
 *
 * Dependency injection setup for domain services
 * Creates service instances with their dependencies
 */

import { prisma } from '@repo/database';
import { authEvents } from '@repo/auth';
import {
  ProfileRepository,
  ProfileService,
  TokenRepository,
  TokenService,
  UserRepository,
  UserService,
  VerificationRepository,
  VerificationService,
  IdentityRepository,
  SecurityEventRepository,
  SessionRepository,
  AuthorizationCodeRepository,
  RefreshTokenRepository,
  SessionTransferTokenRepository,
  ServiceIdentityRepository,
} from '@repo/core';
import {
  requireOAuthClient as coreRequireOAuthClient,
  authenticateConfidentialClient as coreAuthenticateConfidentialClient,
  PrismaOAuthClientRepository,
} from '@repo/auth-core';

export const profileRepository = new ProfileRepository(prisma);
export const userRepository = new UserRepository(prisma);
export const verificationRepository = new VerificationRepository(prisma);
export const tokenRepository = new TokenRepository(prisma);
export const identityRepository = new IdentityRepository(prisma);
export const securityEventRepository = new SecurityEventRepository(prisma);
export const sessionRepository = new SessionRepository(prisma);
export const authorizationCodeRepository = new AuthorizationCodeRepository(prisma);
export const refreshTokenRepository = new RefreshTokenRepository(prisma);
export const sessionTransferTokenRepository = new SessionTransferTokenRepository(prisma);
export const serviceIdentityRepository = new ServiceIdentityRepository(prisma);
export const oauthClientRepository = new PrismaOAuthClientRepository(prisma);

// Create service instances (inject repositories and dependencies)
export const profileService = new ProfileService(profileRepository, userRepository);
export const userService = new UserService(userRepository, authEvents);
export const verificationService = new VerificationService(
  prisma,
  verificationRepository,
  authEvents
);
export const tokenService = new TokenService(tokenRepository, authEvents);

type RequireOAuthClientParams = Omit<Parameters<typeof coreRequireOAuthClient>[0], 'repo'>;
type AuthenticateClientParams = Omit<
  Parameters<typeof coreAuthenticateConfidentialClient>[0],
  'repo'
>;

export const oauthClientService = {
  requireClient: (params: RequireOAuthClientParams) =>
    coreRequireOAuthClient({ ...params, repo: oauthClientRepository }),
  authenticateConfidentialClient: (params: AuthenticateClientParams) =>
    coreAuthenticateConfidentialClient({ ...params, repo: oauthClientRepository }),
};

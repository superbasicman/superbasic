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
} from '@repo/core';

export const profileRepository = new ProfileRepository(prisma);
export const userRepository = new UserRepository(prisma);
export const verificationRepository = new VerificationRepository(prisma);
export const tokenRepository = new TokenRepository(prisma);
export const identityRepository = new IdentityRepository(prisma);
export const securityEventRepository = new SecurityEventRepository(prisma);
export const sessionRepository = new SessionRepository(prisma);
export const authorizationCodeRepository = new AuthorizationCodeRepository(prisma);

// Create service instances (inject repositories and dependencies)
export const profileService = new ProfileService(prisma);
export const userService = new UserService(userRepository, authEvents);
export const verificationService = new VerificationService(
  prisma,
  verificationRepository,
  authEvents
);
export const tokenService = new TokenService(tokenRepository, authEvents);

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
  UserRepository,
  UserService,
  VerificationRepository,
  VerificationService,
} from '@repo/core';

export const profileRepository = new ProfileRepository(prisma);
export const userRepository = new UserRepository(prisma);
export const verificationRepository = new VerificationRepository(prisma);

// Create service instances (inject repositories and dependencies)
export const profileService = new ProfileService(prisma);
export const userService = new UserService(userRepository, authEvents);
export const verificationService = new VerificationService(
  prisma,
  verificationRepository,
  authEvents
);

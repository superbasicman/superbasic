/**
 * Service Registry
 * 
 * Dependency injection setup for domain services
 * Creates service instances with their dependencies
 */

import { prisma } from "@repo/database";
import { authEvents } from "@repo/auth";
import {
  TokenRepository,
  TokenService,
  ProfileRepository,
  ProfileService,
  UserRepository,
  UserService,
} from "@repo/core";

// Create repository instances (inject Prisma)
export const tokenRepository = new TokenRepository(prisma);
export const profileRepository = new ProfileRepository(prisma);
export const userRepository = new UserRepository(prisma);

// Create service instances (inject repositories and dependencies)
export const tokenService = new TokenService(tokenRepository, authEvents);
export const profileService = new ProfileService(prisma);
export const userService = new UserService(userRepository, authEvents);

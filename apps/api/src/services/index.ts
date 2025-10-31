/**
 * Service Registry
 * 
 * Dependency injection setup for domain services
 * Creates service instances with their dependencies
 */

import { prisma } from "@repo/database";
import { authEvents } from "@repo/auth";
import { TokenRepository, TokenService } from "@repo/core";

// Create repository instances
export const tokenRepository = new TokenRepository(prisma);

// Create service instances with dependencies
export const tokenService = new TokenService(tokenRepository, authEvents);

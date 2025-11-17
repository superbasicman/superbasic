import { TokenService as RefreshTokenService } from '@repo/auth-core';
import { prisma } from '@repo/database';

export const refreshTokenService = new RefreshTokenService({ prisma });

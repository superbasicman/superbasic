import { createAuthService } from '@repo/auth-core';
import { prisma } from '@repo/database';

export const authService = await createAuthService({ prisma });

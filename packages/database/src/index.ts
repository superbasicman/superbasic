import { PrismaClient } from '@prisma/client';

export { PrismaClient };
export { Prisma } from '@prisma/client';
export type {
  User,
  Profile,
  ApiKey,
  AuthSession,
  RefreshToken,
  UserPassword,
  VerificationToken,
  UserIdentity,
  OAuthClient,
  OAuthAuthorizationCode,
  UserState,
  IdentityProvider,
  VerificationTokenType,
  ServiceIdentity,
  ClientSecret,
  MfaLevel,
} from '@prisma/client';
export * from './context.js';
import { setPostgresContext, resetPostgresContext, type PostgresAppContext } from './context.js';

// Global singleton instance for use across the application
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export const setGlobalPostgresContext = (context: PostgresAppContext) =>
  setPostgresContext(prisma, context);
export const resetGlobalPostgresContext = () => resetPostgresContext(prisma);

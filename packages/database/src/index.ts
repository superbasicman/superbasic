import { PrismaClient } from "@prisma/client";

export { PrismaClient };
export { Prisma } from "@prisma/client";
export type {
  User,
  Profile,
  ApiKey,
  Account,
  Session,
  VerificationToken,
  UserIdentity,
  Token,
  OAuthClient,
} from "@prisma/client";
export * from "./context.js";

// Global singleton instance for use across the application
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

import { PrismaClient } from "@prisma/client";

export { PrismaClient };

// Global singleton instance for use across the application
// Prevents multiple instances in development with hot reloading
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Ensure Prisma client is up-to-date with latest schema
// If an old client is cached without expected models, force recreation
if (globalForPrisma.prisma) {
  const models = Object.keys(globalForPrisma.prisma)
    .filter((k) => !k.startsWith("_") && !k.startsWith("$"))
    .sort();
  // Check for Profile model (added in Phase 2)
  if (!models.includes("profile")) {
    globalForPrisma.prisma = undefined;
  }
  // Check for ApiKey model (added in Phase 3)
  if (!models.includes("apiKey")) {
    globalForPrisma.prisma = undefined;
  }
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DataType, newDb } from "pg-mem";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export { PrismaClient };
export type { User, Profile, ApiKey, Account, Session, VerificationToken } from "@prisma/client";

// Global singleton instance for use across the application
// Prevents multiple instances in development with hot reloading
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaUsesPgMem?: boolean;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function shouldUseInMemoryDatabase(): boolean {
  if (process.env.DATABASE_FORCE_REMOTE === "true") {
    return false;
  }
  if (process.env.DATABASE_FORCE_PGMEM === "true") {
    return true;
  }
  return Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";
}

function createInMemoryPrismaClient(): PrismaClient {
  const db = newDb({ autoCreateForeignKeyIndices: true });

  // Required Postgres function stubs for Prisma
  db.public.registerFunction({
    name: "current_database",
    returns: DataType.text,
    implementation: () => "pg_mem",
  });
  db.public.registerFunction({
    name: "version",
    returns: DataType.text,
    implementation: () => "PostgreSQL 16.2 (pg-mem)",
  });

  const migrationsDir = join(__dirname, "../migrations");
  if (existsSync(migrationsDir)) {
    const migrationFolders = readdirSync(migrationsDir)
      .filter((entry) => /^\d{8}_/.test(entry) || /^\d{14}/.test(entry))
      .sort();

    for (const folder of migrationFolders) {
      const migrationFile = join(migrationsDir, folder, "migration.sql");
      if (!existsSync(migrationFile)) continue;

      const sql = readFileSync(migrationFile, "utf-8").trim();
      if (!sql) continue;

      try {
        db.public.none(sql);
      } catch (error) {
        throw new Error(
          `Failed to apply migration "${folder}" to in-memory database: ${(error as Error).message}`
        );
      }
    }
  }

  const pgAdapter = db.adapters.createPg();
  const pool = new pgAdapter.Pool();
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

function createPrismaClient(): PrismaClient {
  if (shouldUseInMemoryDatabase()) {
    return createInMemoryPrismaClient();
  }
  return new PrismaClient();
}

// Ensure Prisma client is up-to-date with latest schema
// If an old client is cached without expected models, force recreation
const existingClient = globalForPrisma.prisma;

if (existingClient) {
  const expectedPgMem = shouldUseInMemoryDatabase();
  if (globalForPrisma.prismaUsesPgMem !== expectedPgMem) {
    globalForPrisma.prisma = undefined;
  } else {
    const models = Object.keys(existingClient)
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
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaUsesPgMem = shouldUseInMemoryDatabase();
}

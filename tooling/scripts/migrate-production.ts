#!/usr/bin/env tsx
/**
 * Run Prisma migrations against Neon main branch (production)
 *
 * Usage:
 *   pnpm tsx tooling/scripts/migrate-production.ts
 *
 * Reads NEON_MAIN_URL from packages/database/.env.local
 *
 * This script:
 * 1. Loads NEON_MAIN_URL from .env.local
 * 2. Runs `prisma migrate deploy` against main branch
 * 3. Shows migration status
 */

import { execSync } from "node:child_process";
import { config } from "dotenv";
import { resolve } from "node:path";

// Load environment variables from packages/database/.env.local
config({ path: resolve(process.cwd(), "packages/database/.env.local") });

const mainUrl = process.env.NEON_MAIN_URL;

if (!mainUrl) {
  console.error(
    "❌ Error: NEON_MAIN_URL not found in packages/database/.env.local"
  );
  console.error("");
  console.error(
    "Add your main branch connection string to packages/database/.env.local:"
  );
  console.error("");
  console.error('  NEON_MAIN_URL="postgresql://user:pass@host/dbname"');
  console.error("");
  console.error(
    "Get it from: https://console.neon.tech → Your Project → Branches → main"
  );
  console.error("");
  process.exit(1);
}

if (!mainUrl.startsWith("postgresql://")) {
  console.error("❌ Error: Invalid NEON_MAIN_URL format");
  console.error("");
  console.error('Connection string must start with "postgresql://"');
  console.error("");
  console.error("Example:");
  console.error(
    '  NEON_MAIN_URL="postgresql://user:pass@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb"'
  );
  console.error("");
  process.exit(1);
}

console.log("🔍 Checking migration status on main branch...\n");

try {
  // Show pending migrations (exits with code 1 if migrations are pending - that's expected)
  execSync("prisma migrate status", {
    cwd: "packages/database",
    env: { ...process.env, DATABASE_URL: mainUrl },
    stdio: "inherit",
  });
} catch (error) {
  // Status command exits with 1 when migrations are pending - this is expected
  // Only fail if it's a real error (connection issues, etc)
  if (
    error instanceof Error &&
    "status" in error &&
    (error as any).status !== 1
  ) {
    console.error("\n❌ Failed to check migration status:", error);
    process.exit(1);
  }
}

console.log("\n📦 Applying migrations to main branch...\n");

try {
  // Apply migrations
  execSync("prisma migrate deploy", {
    cwd: "packages/database",
    env: { ...process.env, DATABASE_URL: mainUrl },
    stdio: "inherit",
  });

  console.log("\n✅ Migrations applied successfully to main branch!");
  console.log("");
  console.log("Next steps:");
  console.log("1. Verify in Neon console that tables exist");
  console.log("2. Deploy to Vercel production");
  console.log(
    "3. Test production API: curl https://your-api.vercel.app/v1/health"
  );
} catch (error) {
  console.error("\n❌ Migration deployment failed:", error);
  process.exit(1);
}

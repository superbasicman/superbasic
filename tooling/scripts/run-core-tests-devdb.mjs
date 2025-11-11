import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import dotenv from "dotenv";

const isProd = process.argv.includes("--prod");
const envFile = isProd ? "packages/database/.env.prod" : "packages/database/.env.local";

function loadEnv(relativePath, override = false) {
  const filePath = resolve(process.cwd(), relativePath);
  if (existsSync(filePath)) {
    dotenv.config({ path: filePath, override });
  }
}

if (!existsSync(resolve(process.cwd(), envFile))) {
  console.error(`Env file "${envFile}" not found. Create it with the ${isProd ? "production" : "dev"} DATABASE_URL.`);
  process.exit(1);
}

loadEnv(envFile, true);
loadEnv("packages/database/.env.test");

if (!process.env.DATABASE_URL) {
  console.error(
    `DATABASE_URL is not set. Update ${envFile} before running ${
      isProd ? "test:core:prod" : "test:core:devdb"
    }.`
  );
  process.exit(1);
}

const child = spawn("pnpm", ["test", "--filter", "core", "--", "--run"], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

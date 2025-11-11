import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import dotenv from "dotenv";

function loadEnv(relativePath, override = false) {
  const filePath = resolve(process.cwd(), relativePath);
  if (existsSync(filePath)) {
    dotenv.config({ path: filePath, override });
  }
}

loadEnv("packages/database/.env.local", true);
loadEnv("packages/database/.env.test");

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Update packages/database/.env.local before running test:core:devdb."
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

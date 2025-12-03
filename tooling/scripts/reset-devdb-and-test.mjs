import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import dotenv from "dotenv";

const repoRoot = process.cwd();
const databaseDir = resolve(repoRoot, "packages/database");
const isProd = process.argv.includes("--prod");
const isDev = process.argv.includes("--dev");
const envFile = isProd
  ? "packages/database/.env.prod"
  : isDev
    ? "packages/database/.env.local"
    : "packages/database/.env.test";

function loadEnv(relativePath, override = false) {
  const filePath = resolve(repoRoot, relativePath);
  if (existsSync(filePath)) {
    dotenv.config({ path: filePath, override });
  }
}

if (!existsSync(resolve(repoRoot, envFile))) {
  console.error(`Env file "${envFile}" not found. Create it with the production DATABASE_URL.`);
  process.exit(1);
}

loadEnv(envFile, true);
// Pull in API env so token hashing secrets and other shared vars are available for tests
loadEnv("apps/api/.env.local");
// In dev mode, keep .env.local; otherwise let test env override for local runs
if (!isDev) {
  loadEnv("apps/api/.env.test", true);
}

const databaseUrl = process.env.DATABASE_URL;
const baseEnv = { ...process.env, DATABASE_URL: databaseUrl };

if (!databaseUrl) {
  console.error(
    "DATABASE_URL is not set. Update packages/database/.env.local before running db:reset-and-test."
  );
  process.exit(1);
}

const rl = readline.createInterface({ input, output });

async function confirm(prompt) {
  const answer = (await rl.question(`${prompt} (y/N): `)).trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...baseEnv, ...options.env },
      cwd: options.cwd ?? repoRoot,
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "null"}`));
      }
    });
  });
}

async function dropPublicSchema() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["prisma", "db", "execute", "--schema", "schema.prisma", "--stdin"],
      {
        stdio: ["pipe", "inherit", "inherit"],
        cwd: databaseDir,
        // Prisma reads DATABASE_URL from env; pass explicitly to avoid config lookup or overrides
        env: baseEnv,
      }
    );

    child.stdin.write("DROP SCHEMA public CASCADE;\n");
    child.stdin.write("CREATE SCHEMA public;\n");
    child.stdin.end();

    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
      } else {
        reject(new Error(`prisma db execute exited with code ${code ?? "null"}`));
      }
    });
  });
}

async function main() {
  console.log("This will DROP the entire public schema at:");
  console.log(`  ${databaseUrl}`);

  const proceed = await confirm("Continue");
  rl.close();

  if (!proceed) {
    console.log("Aborted.");
    return;
  }

  console.log("\nDropping and recreating schema public...");
  await dropPublicSchema();

  console.log("\nApplying migrations...");
  await runCommand("pnpm", ["prisma", "migrate", "deploy"], {
    cwd: resolve(repoRoot, "packages/database"),
  });

  console.log("\nRunning core test suite...");
  await runCommand("pnpm", ["test", "--filter", "core", "--", "--run"]);

  console.log("\nDone!");
}

main().catch((error) => {
  rl.close();
  console.error("\nCommand failed:", error.message);
  process.exit(1);
});

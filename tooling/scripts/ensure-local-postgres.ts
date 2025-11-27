#!/usr/bin/env tsx

/**
 * Best-effort helper to ensure a local Postgres instance is available on localhost:5432.
 * - If a server is already listening, it exits quietly.
 * - If Docker is available, it will start or create a container named "superbasic-pg-dev".
 * - If neither Postgres nor Docker is present, it prints guidance and exits without failing.
 *
 * This script is safe to run during postinstall; it never throws.
 */

import net from 'node:net';
import { execSync } from 'node:child_process';

const HOST = 'localhost';
const PORT = 5432;
const CONTAINER_NAME = 'superbasic-pg-dev';
const IMAGE = 'postgres:16';
const DB_NAME = 'superbasic_test';
const DB_USER = 'superbasic';
const DB_PASSWORD = 'superbasic';

function isCI(): boolean {
  return process.env.CI === 'true' || process.env.CI === '1';
}

async function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

function hasDocker(): boolean {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function hasBrew(): boolean {
  try {
    execSync('brew --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function hasPsql(): boolean {
  try {
    execSync('psql --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function containerExists(name: string): boolean {
  try {
    const output = execSync(`docker ps -a --filter "name=${name}" --format "{{.Names}}"`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return output.split('\n').some((line) => line.trim() === name);
  } catch {
    return false;
  }
}

function startContainer(name: string) {
  execSync(`docker start ${name}`, { stdio: 'ignore' });
}

function createContainer() {
  execSync(
    [
      'docker run -d',
      `--name ${CONTAINER_NAME}`,
      '-e POSTGRES_PASSWORD=' + DB_PASSWORD,
      '-e POSTGRES_USER=' + DB_USER,
      '-e POSTGRES_DB=' + DB_NAME,
      '-p 5432:5432',
      IMAGE,
    ].join(' '),
    { stdio: 'ignore' }
  );
}

function ensureLocalRoleAndDb() {
  try {
    execSync('psql -d postgres -Atqc "SELECT 1"', { stdio: 'ignore' });
  } catch {
    console.warn(
      '[local-postgres] Local Postgres not reachable via psql. Start it first (e.g., brew services start postgresql@16).'
    );
    return;
  }

  try {
    execSync(
      `psql -d postgres -c "DO \\$\\$BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${DB_USER}') THEN CREATE ROLE ${DB_USER} LOGIN SUPERUSER PASSWORD '${DB_PASSWORD}'; END IF; END\\$\\$;"`,
      { stdio: 'ignore' }
    );
  } catch (error) {
    console.warn(
      `[local-postgres] Could not ensure role ${DB_USER}: ${(error as Error).message}`
    );
  }

  try {
    execSync(
      `psql -d postgres -c "DO \\$\\$BEGIN IF NOT EXISTS (SELECT FROM pg_database WHERE datname='${DB_NAME}') THEN CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}; END IF; END\\$\\$;"`,
      { stdio: 'ignore' }
    );
  } catch (error) {
    console.warn(
      `[local-postgres] Could not ensure database ${DB_NAME}: ${(error as Error).message}`
    );
  }
}

function startBrewPostgres() {
  execSync('brew services start postgresql@16', { stdio: 'ignore' });
}

async function main() {
  if (isCI()) {
    return; // Avoid side effects in CI
  }

  const alreadyListening = await isPortOpen(HOST, PORT);
  if (alreadyListening) {
    return;
  }

  // Prefer Homebrew service when present
  if (hasBrew()) {
    try {
      startBrewPostgres();
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (await isPortOpen(HOST, PORT)) {
        ensureLocalRoleAndDb();
        return;
      }
    } catch (error) {
      console.warn(
        `[local-postgres] Failed to start Homebrew postgresql@16 service: ${(error as Error).message}`
      );
    }
  }

  if (!hasDocker()) {
    if (hasPsql()) {
      ensureLocalRoleAndDb();
      return;
    }
    console.warn(
      '[local-postgres] No Postgres detected on localhost:5432 and Docker/psql are not available. Install/start Postgres (e.g., brew install postgresql@16 && brew services start postgresql@16 && createdb superbasic_test) or update DATABASE_URL to a reachable instance.'
    );
    return;
  }

  try {
    if (containerExists(CONTAINER_NAME)) {
      startContainer(CONTAINER_NAME);
      console.log(`[local-postgres] Started existing container ${CONTAINER_NAME} on port 5432`);
    } else {
      createContainer();
      console.log(
        `[local-postgres] Created and started ${CONTAINER_NAME} (postgres:16) on localhost:5432`
      );
    }

    // Give the server a moment to come up, then re-check
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (!(await isPortOpen(HOST, PORT))) {
      console.warn(
        `[local-postgres] Postgres container did not become available on ${HOST}:${PORT}. Check Docker logs for ${CONTAINER_NAME}.`
      );
    }
  } catch (error) {
    console.warn(
      `[local-postgres] Failed to ensure local Postgres: ${(error as Error).message}. Start Postgres manually or adjust DATABASE_URL.`
    );
  }
}

main().catch((error) => {
  console.warn(
    `[local-postgres] Unexpected error while ensuring local Postgres: ${(error as Error).message}`
  );
});

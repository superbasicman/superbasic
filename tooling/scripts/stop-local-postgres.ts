#!/usr/bin/env tsx

/**
 * Best-effort helper to stop local Postgres:
 * - Tries to stop Homebrew postgresql@16 service.
 * - Tries to stop the Docker container "superbasic-pg-dev" if present.
 * - Never throws; logs warnings on failure.
 */

import { execSync } from 'node:child_process';

const CONTAINER_NAME = 'superbasic-pg-dev';

function isCI(): boolean {
  return process.env.CI === 'true' || process.env.CI === '1';
}

function hasBrew(): boolean {
  try {
    execSync('brew --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function hasDocker(): boolean {
  try {
    execSync('docker --version', { stdio: 'ignore' });
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

function stopBrewService() {
  execSync('brew services stop postgresql@16', { stdio: 'ignore' });
  console.log('[local-postgres] Stopped Homebrew postgresql@16 service.');
}

function stopDockerContainer(name: string) {
  execSync(`docker stop ${name}`, { stdio: 'ignore' });
  console.log(`[local-postgres] Stopped Docker container ${name}.`);
}

function main() {
  if (isCI()) {
    return;
  }

  if (hasBrew()) {
    try {
      stopBrewService();
    } catch (error) {
      console.warn(
        `[local-postgres] Failed to stop Homebrew postgresql@16 service: ${(error as Error).message}`
      );
    }
  }

  if (hasDocker() && containerExists(CONTAINER_NAME)) {
    try {
      stopDockerContainer(CONTAINER_NAME);
    } catch (error) {
      console.warn(
        `[local-postgres] Failed to stop Docker container ${CONTAINER_NAME}: ${(error as Error).message}`
      );
    }
  }
}

main();

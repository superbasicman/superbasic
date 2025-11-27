#!/usr/bin/env node
/**
 * Pre-deployment validation script
 * 
 * Usage:
 *   pnpm deploy-check           # Quick check (lint + typecheck)
 *   pnpm deploy-check --full    # Full check (lint + typecheck + test + build)
 */

import { spawn } from 'node:child_process';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const fullCheck = args.includes('--full');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const errorReportPath = resolve(__dirname, '../../errors-to-fix.md');
const MAX_ERROR_LOG_LENGTH = 4000;

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function runCommand(command: string, description: string): Promise<{ passed: boolean; output: string }> {
  log(`\n${colors.bright}▶ ${description}...${colors.reset}`, colors.blue);
  return new Promise((resolve, reject) => {
    let output = '';

    const child = spawn(command, {
      shell: true,
      cwd: process.cwd(),
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (data) => {
      process.stdout.write(data);
      output += data.toString();
    });

    child.stderr?.on('data', (data) => {
      process.stderr.write(data);
      output += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        log(`✓ ${description} passed`, colors.green);
        resolve({ passed: true, output });
      } else {
        log(`✗ ${description} failed`, colors.red);
        resolve({ passed: false, output });
      }
    });

    child.on('error', (error) => {
      log(`✗ ${description} failed to run: ${error.message}`, colors.red);
      reject(error);
    });
  });
}

function createOutputSnippet(output?: string) {
  if (!output) return null;
  const trimmed = output.trim();
  if (!trimmed) return null;
  if (trimmed.length <= MAX_ERROR_LOG_LENGTH) {
    return trimmed;
  }

  return trimmed.slice(trimmed.length - MAX_ERROR_LOG_LENGTH);
}

function redactDatabaseUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.username) parsed.username = '***';
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return url.replace(/:[^:@/]+@/, ':***@');
  }
}

function writeErrorReport(
  failedCheck: { command: string; description: string } | null,
  extraMessage?: string,
  failedOutput?: string
) {
  const lines = [
    '# errors-to-fix',
    '',
    `Deploy check mode: ${fullCheck ? 'Full (lint + typecheck + test + build)' : 'Quick (lint + typecheck)'}`,
    '',
  ];

  if (failedCheck) {
    lines.push('The deploy check failed with:', '');
    lines.push(`- **Check:** ${failedCheck.description}`);
    lines.push(`- **Command:** \`${failedCheck.command}\``);
  }

  const snippet = failedOutput ? createOutputSnippet(failedOutput) : null;

  if (snippet) {
    lines.push('', 'Last part of the command output:', '', '```', snippet, '```');
  }

  if (extraMessage) {
    lines.push('', extraMessage);
  }

  lines.push(
    '',
    'Review the command output above, fix the issues, and rerun `pnpm deploy-check`.'
  );

  writeFileSync(errorReportPath, `${lines.join('\n')}\n`);
}

async function checkDatabaseConnectivity() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return { passed: true };
  }

  const redacted = redactDatabaseUrl(databaseUrl);

  try {
    const { PrismaClient } = await import('@repo/database');
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });

    const timeout = setTimeout(() => {
      prisma.$disconnect().catch(() => {});
      throw new Error(`Database connectivity check timed out for ${redacted}`);
    }, 5000);

    await prisma.$queryRaw`SELECT 1`;
    clearTimeout(timeout);
    await prisma.$disconnect();

    return { passed: true };
  } catch (error) {
    const message =
      `Database unreachable at ${redacted}. ` +
      'Ensure DATABASE_URL points to an accessible test database and the service is up.';
    return { passed: false, output: error instanceof Error ? error.stack ?? error.message : String(error), extraMessage: message };
  }
}

function cleanupErrorReport() {
  if (existsSync(errorReportPath)) {
    unlinkSync(errorReportPath);
  }
}

async function main() {
  log('\n╔════════════════════════════════════════════╗', colors.bright);
  log('║     Pre-Deployment Validation Check        ║', colors.bright);
  log('╚════════════════════════════════════════════╝', colors.bright);
  
  if (fullCheck) {
  log('\nMode: Full Check (lint + typecheck + test + build)', colors.yellow);
  } else {
    log('\nMode: Quick Check (lint + typecheck)', colors.yellow);
    log('Tip: Use --full flag for complete validation', colors.yellow);
  }

  const checks: Array<{ command: string; description: string }> = [
    { command: 'pnpm run lint', description: 'Linting' },
    { command: 'pnpm run typecheck', description: 'Type checking' },
  ];

  if (fullCheck) {
    checks.push(
      { command: 'pnpm run test', description: 'Running tests' },
      { command: 'pnpm run build', description: 'Building for production' }
    );
  }

  let allPassed = true;
  let failedCheck: { command: string; description: string } | null = null;
  let failedOutput = '';

  // Best-effort: if this is a full check, try to ensure a local Postgres is available (no-op in CI)
  if (fullCheck) {
    await runCommand('pnpm run db:ensure-local', 'Ensuring local Postgres (optional)');
  }

  // Pre-flight DB connectivity before kicking off tests to fail fast with a clear message
  const dbCheck = await checkDatabaseConnectivity();
  if (!dbCheck.passed) {
    writeErrorReport(
      { command: 'database connectivity', description: 'Database connectivity' },
      dbCheck.extraMessage,
      dbCheck.output
    );
    log('\n✗ Deployment check failed. Fix errors before deploying.', colors.red);
    process.exit(1);
  }

  for (const check of checks) {
    const result = await runCommand(check.command, check.description);
    if (!result.passed) {
      allPassed = false;
      failedCheck = check;
      failedOutput = result.output;
      break; // Stop on first failure
    }
  }

  log('\n' + '═'.repeat(46), colors.bright);
  
  if (allPassed) {
    cleanupErrorReport();
    log('\n✓ All checks passed! Ready to deploy.', colors.green);
    log('\nNext steps:', colors.bright);
    log('  1. Commit your changes: git add . && git commit -m "..."');
    log('  2. Push to trigger deployment: git push');
    process.exit(0);
  } else {
    writeErrorReport(failedCheck, undefined, failedOutput);
    log('\n✗ Deployment check failed. Fix errors before deploying.', colors.red);
    process.exit(1);
  }
}

main().catch((error) => {
  log(`\n✗ Unexpected error: ${error.message}`, colors.red);
  writeErrorReport(null, `Unexpected error: ${error.message}`);
  process.exit(1);
});

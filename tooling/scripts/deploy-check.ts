#!/usr/bin/env node
/**
 * Pre-deployment validation script
 * 
 * Usage:
 *   pnpm deploy-check           # Quick check (lint + typecheck)
 *   pnpm deploy-check --full    # Full check (lint + typecheck + test + build)
 */

import { execSync } from 'node:child_process';
import process from 'node:process';

const args = process.argv.slice(2);
const fullCheck = args.includes('--full');

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

function runCommand(command: string, description: string): boolean {
  log(`\n${colors.bright}▶ ${description}...${colors.reset}`, colors.blue);
  try {
    execSync(command, { stdio: 'inherit', cwd: process.cwd() });
    log(`✓ ${description} passed`, colors.green);
    return true;
  } catch (error) {
    log(`✗ ${description} failed`, colors.red);
    return false;
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

  for (const check of checks) {
    const passed = runCommand(check.command, check.description);
    if (!passed) {
      allPassed = false;
      break; // Stop on first failure
    }
  }

  log('\n' + '═'.repeat(46), colors.bright);
  
  if (allPassed) {
    log('\n✓ All checks passed! Ready to deploy.', colors.green);
    log('\nNext steps:', colors.bright);
    log('  1. Commit your changes: git add . && git commit -m "..."');
    log('  2. Push to trigger deployment: git push');
    process.exit(0);
  } else {
    log('\n✗ Deployment check failed. Fix errors before deploying.', colors.red);
    process.exit(1);
  }
}

main().catch((error) => {
  log(`\n✗ Unexpected error: ${error.message}`, colors.red);
  process.exit(1);
});

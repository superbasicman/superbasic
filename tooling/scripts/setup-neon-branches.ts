#!/usr/bin/env tsx

/**
 * Interactive setup script for Neon database branch configuration
 *
 * Usage:
 *   pnpm tsx tooling/scripts/setup-neon-branches.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

function log(message: string) {
  console.log(`\n${message}`);
}

function success(message: string) {
  console.log(`\n✅ ${message}`);
}

function info(message: string) {
  console.log(`\n💡 ${message}`);
}

async function main() {
  console.clear();
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Neon Database Branch Setup                                ║');
  console.log('║  Configure dev/main branch isolation                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  log('This script will help you configure:');
  console.log('  • Local development → Neon dev branch');
  console.log('  • Vercel preview → Neon dev branch');
  console.log('  • Vercel production → Neon main branch');

  const proceed = await question('\nReady to start? (y/n): ');
  if (proceed.toLowerCase() !== 'y') {
    console.log('\nSetup cancelled.');
    rl.close();
    return;
  }

  // Step 1: Get Neon connection strings
  log('═══════════════════════════════════════════════════════════');
  log('STEP 1: Get Neon Connection Strings');
  log('═══════════════════════════════════════════════════════════');

  info('Open https://console.neon.tech in your browser');
  console.log('  1. Select your project');
  console.log('  2. Click "Branches" in the sidebar');
  console.log('  3. If you don\'t have a "dev" branch, create one:');
  console.log('     - Click "Create Branch"');
  console.log('     - Name: dev');
  console.log('     - Parent: main');
  console.log('     - Include data: Yes');

  await question('\nPress Enter when you have both branches ready...');

  log('Now copy the connection strings:');
  console.log('  1. Click on "main" branch');
  console.log('  2. Copy the connection string (starts with postgresql://)');

  const mainBranch = await question('\nPaste main branch connection string: ');

  if (!mainBranch.startsWith('postgresql://')) {
    console.error('\n❌ Invalid connection string. Must start with postgresql://');
    rl.close();
    return;
  }

  log('Great! Now get the dev branch connection string:');
  console.log('  1. Click on "dev" branch');
  console.log('  2. Copy the connection string');

  const devBranch = await question('\nPaste dev branch connection string: ');

  if (!devBranch.startsWith('postgresql://')) {
    console.error('\n❌ Invalid connection string. Must start with postgresql://');
    rl.close();
    return;
  }

  success('Connection strings saved!');

  // Step 2: Update local files
  log('═══════════════════════════════════════════════════════════');
  log('STEP 2: Update Local Environment Files');
  log('═══════════════════════════════════════════════════════════');

  const updateLocal = await question('\nUpdate local .env.local files with dev branch? (y/n): ');

  if (updateLocal.toLowerCase() === 'y') {
    try {
      // Update apps/api/.env.local
      const apiEnvPath = resolve(process.cwd(), 'apps/api/.env.local');
      let apiEnv = readFileSync(apiEnvPath, 'utf-8');
      apiEnv = apiEnv.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${devBranch}`);
      writeFileSync(apiEnvPath, apiEnv);
      success('Updated apps/api/.env.local');

      // Update packages/database/.env.local
      const dbEnvPath = resolve(process.cwd(), 'packages/database/.env.local');
      let dbEnv = readFileSync(dbEnvPath, 'utf-8');
      dbEnv = dbEnv.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${devBranch}`);
      writeFileSync(dbEnvPath, dbEnv);
      success('Updated packages/database/.env.local');

      info('Local files now use dev branch');
    } catch (error) {
      console.error('\n❌ Error updating files:', error);
    }
  } else {
    info('Skipped local file updates');
  }

  // Step 3: Vercel instructions
  log('═══════════════════════════════════════════════════════════');
  log('STEP 3: Configure Vercel Environment Variables');
  log('═══════════════════════════════════════════════════════════');

  info('Now you need to configure Vercel manually:');
  console.log('\n1. Open https://vercel.com/dashboard');
  console.log('2. Select your API project');
  console.log('3. Go to Settings → Environment Variables');
  console.log('4. Find DATABASE_URL and delete it (if it exists)');

  await question('\nPress Enter when DATABASE_URL is deleted...');

  log('Now add DATABASE_URL for PRODUCTION:');
  console.log('  1. Click "Add New"');
  console.log('  2. Key: DATABASE_URL');
  console.log('  3. Value: (copy from below)');
  console.log('  4. Check ONLY "Production"');
  console.log('  5. Click "Save"');

  console.log('\n┌────────────────────────────────────────────────────────────┐');
  console.log('│ PRODUCTION DATABASE_URL (main branch):                    │');
  console.log('└────────────────────────────────────────────────────────────┘');
  console.log(mainBranch);

  await question('\nPress Enter when production DATABASE_URL is added...');

  log('Now add DATABASE_URL for PREVIEW:');
  console.log('  1. Click "Add New" again');
  console.log('  2. Key: DATABASE_URL (same name)');
  console.log('  3. Value: (copy from below)');
  console.log('  4. Check ONLY "Preview"');
  console.log('  5. Click "Save"');

  console.log('\n┌────────────────────────────────────────────────────────────┐');
  console.log('│ PREVIEW DATABASE_URL (dev branch):                        │');
  console.log('└────────────────────────────────────────────────────────────┘');
  console.log(devBranch);

  await question('\nPress Enter when preview DATABASE_URL is added...');

  success('Vercel environment variables configured!');

  // Step 4: Redeploy
  log('═══════════════════════════════════════════════════════════');
  log('STEP 4: Redeploy');
  log('═══════════════════════════════════════════════════════════');

  info('Final step - redeploy your apps:');
  console.log('\n1. In Vercel, go to Deployments tab');
  console.log('2. Find your latest production deployment');
  console.log('3. Click "..." menu → "Redeploy"');
  console.log('4. If you have preview deployments, redeploy those too');

  await question('\nPress Enter when redeployments are complete...');

  // Summary
  log('═══════════════════════════════════════════════════════════');
  log('✨ Setup Complete!');
  log('═══════════════════════════════════════════════════════════');

  console.log('\n📋 Configuration Summary:');
  console.log('  • Local development → dev branch');
  console.log('  • Vercel preview → dev branch');
  console.log('  • Vercel production → main branch');

  log('🔍 Verify your setup:');
  console.log('  pnpm tsx tooling/scripts/check-db-branch.ts');
  console.log('  curl https://your-api-production.vercel.app/v1/health');
  console.log('  curl https://your-api-preview.vercel.app/v1/health');

  console.log('\n');
  rl.close();
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  rl.close();
  process.exit(1);
});

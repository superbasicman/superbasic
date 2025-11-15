#!/usr/bin/env tsx

/**
 * Interactive environment setup wizard
 * Configures all required environment variables for local development
 * 
 * Usage:
 *   pnpm tsx tooling/scripts/setup-env.ts
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
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

function warning(message: string) {
  console.log(`\n⚠️  ${message}`);
}

function generateSecret(): string {
  try {
    return execSync('openssl rand -base64 32').toString().trim();
  } catch {
    // Fallback if openssl not available
    return Array.from({ length: 32 }, () => 
      Math.random().toString(36)[2] || '0'
    ).join('');
  }
}

async function main() {
  console.clear();
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  SuperBasic Finance - Environment Setup Wizard            ║');
  console.log('║  Configure all required environment variables              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  log('This wizard will help you configure:');
  console.log('  • Database (Neon Postgres)');
  console.log('  • Authentication (Auth.js secrets)');
  console.log('  • Rate Limiting (Upstash Redis)');
  console.log('  • OAuth (Google)');
  console.log('  • Email (Resend)');

  const proceed = await question('\nReady to start? (y/n): ');
  if (proceed.toLowerCase() !== 'y') {
    console.log('\nSetup cancelled.');
    rl.close();
    return;
  }

  const config: Record<string, string> = {};

  // ============================================================
  // STEP 1: Database (Neon)
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 1: Database Configuration (Neon Postgres)');
  log('═══════════════════════════════════════════════════════════');

  info('Open https://console.neon.tech in your browser');
  console.log('  1. Select your project (or create a new one)');
  console.log('  2. Click "Branches" in the sidebar');
  console.log('  3. Create a "dev" branch if you don\'t have one:');
  console.log('     - Click "Create Branch"');
  console.log('     - Name: dev');
  console.log('     - Parent: main');
  console.log('     - Include data: Yes');
  console.log('  4. Click on "dev" branch');
  console.log('  5. Copy the connection string (starts with postgresql://)');

  await question('\nPress Enter when ready to paste connection string...');

  const databaseUrl = await question('Paste dev branch connection string: ');
  
  if (!databaseUrl.startsWith('postgresql://')) {
    console.error('\n❌ Invalid connection string. Must start with postgresql://');
    rl.close();
    return;
  }

  config.DATABASE_URL = databaseUrl;
  success('Database configured!');

  // ============================================================
  // STEP 2: Authentication Secret
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 2: Authentication Secret (Auth.js)');
  log('═══════════════════════════════════════════════════════════');

  info('Generating a secure random secret for Auth.js...');
  const authSecret = generateSecret();
  config.AUTH_SECRET = authSecret;
  success('Auth secret generated!');

  info('Generating token hashing key material...');
  const tokenHashKey = generateSecret();
  config.TOKEN_HASH_KEYS = JSON.stringify({ v1: tokenHashKey });
  config.TOKEN_HASH_ACTIVE_KEY_ID = 'v1';
  success('Token hashing keys configured!');

  // ============================================================
  // STEP 3: Server Configuration
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 3: Server Configuration');
  log('═══════════════════════════════════════════════════════════');

  config.PORT = '3000';
  config.NODE_ENV = 'development';
  config.AUTH_URL = 'http://localhost:3000';
  config.AUTH_TRUST_HOST = 'true';
  config.WEB_APP_URL = 'http://localhost:5173';
  
  success('Server configuration set to defaults');

  // ============================================================
  // STEP 4: Rate Limiting (Upstash Redis)
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 4: Rate Limiting (Upstash Redis)');
  log('═══════════════════════════════════════════════════════════');

  info('Open https://console.upstash.com in your browser');
  console.log('  1. Sign in or create an account');
  console.log('  2. Click "Create Database" (if you don\'t have one)');
  console.log('  3. Choose a name and region');
  console.log('  4. Click on your database');
  console.log('  5. Scroll to "REST API" section');
  console.log('  6. Copy "UPSTASH_REDIS_REST_URL"');

  await question('\nPress Enter when ready to paste Redis URL...');

  const redisUrl = await question('Paste UPSTASH_REDIS_REST_URL: ');
  
  if (!redisUrl.startsWith('https://')) {
    warning('URL should start with https:// - continuing anyway...');
  }

  config.UPSTASH_REDIS_REST_URL = redisUrl;

  log('Now copy the REST token:');
  console.log('  7. Copy "UPSTASH_REDIS_REST_TOKEN" (below the URL)');

  const redisToken = await question('Paste UPSTASH_REDIS_REST_TOKEN: ');
  config.UPSTASH_REDIS_REST_TOKEN = redisToken;

  success('Redis configured!');

  // ============================================================
  // STEP 5: Google OAuth (Optional)
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 5: Google OAuth (Optional)');
  log('═══════════════════════════════════════════════════════════');

  const setupGoogle = await question('Set up Google OAuth now? (y/n): ');

  if (setupGoogle.toLowerCase() === 'y') {
    info('Open https://console.cloud.google.com/apis/credentials');
    console.log('  1. Create a new project or select existing one');
    console.log('  2. Click "Create Credentials" → "OAuth 2.0 Client ID"');
    console.log('  3. Configure OAuth consent screen if prompted');
    console.log('  4. Application type: Web application');
    console.log('  5. Add authorized redirect URI:');
    console.log('     http://localhost:3000/v1/auth/callback/google');
    console.log('  6. Click "Create"');
    console.log('  7. Copy Client ID and Client Secret');

    await question('\nPress Enter when ready to paste credentials...');

    const googleClientId = await question('Paste Google Client ID: ');
    const googleClientSecret = await question('Paste Google Client Secret: ');

    config.GOOGLE_CLIENT_ID = googleClientId;
    config.GOOGLE_CLIENT_SECRET = googleClientSecret;

    success('Google OAuth configured!');
  } else {
    info('Skipping Google OAuth - you can add it later');
    config.GOOGLE_CLIENT_ID = 'your_google_client_id';
    config.GOOGLE_CLIENT_SECRET = 'your_google_client_secret';
  }

  // ============================================================
  // STEP 6: Email Provider (Resend) - Optional
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 6: Email Provider (Resend) - Optional');
  log('═══════════════════════════════════════════════════════════');

  const setupEmail = await question('Set up Resend for magic links? (y/n): ');

  if (setupEmail.toLowerCase() === 'y') {
    info('Open https://resend.com/api-keys');
    console.log('  1. Sign in or create an account');
    console.log('  2. Click "Create API Key"');
    console.log('  3. Give it a name (e.g., "Development")');
    console.log('  4. Copy the API key (starts with re_)');

    await question('\nPress Enter when ready to paste API key...');

    const resendApiKey = await question('Paste Resend API Key: ');
    
    if (!resendApiKey.startsWith('re_')) {
      warning('API key should start with re_ - continuing anyway...');
    }

    config.RESEND_API_KEY = resendApiKey;

    const emailFrom = await question('Enter "from" email address (e.g., noreply@yourdomain.com): ');
    config.EMAIL_FROM = emailFrom || 'onboarding@resend.dev';

    // Dummy SMTP server (required by Auth.js but not used)
    config.EMAIL_SERVER = 'smtp://dummy:dummy@smtp.example.com:587';

    success('Resend configured!');
  } else {
    info('Skipping Resend - you can add it later');
    config.RESEND_API_KEY = 're_your_api_key_here';
    config.EMAIL_FROM = 'onboarding@resend.dev';
    config.EMAIL_SERVER = 'smtp://dummy:dummy@smtp.example.com:587';
  }

  // ============================================================
  // STEP 7: Write Configuration Files
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 7: Writing Configuration Files');
  log('═══════════════════════════════════════════════════════════');

  // Build .env.local content
  const envContent = `# Server Configuration
PORT=${config.PORT}
NODE_ENV=${config.NODE_ENV}

# Database
DATABASE_URL=${config.DATABASE_URL}

# Authentication
AUTH_SECRET=${config.AUTH_SECRET}
AUTH_URL=${config.AUTH_URL}
AUTH_TRUST_HOST=${config.AUTH_TRUST_HOST}
WEB_APP_URL=${config.WEB_APP_URL}
TOKEN_HASH_KEYS='${config.TOKEN_HASH_KEYS}'
TOKEN_HASH_ACTIVE_KEY_ID=${config.TOKEN_HASH_ACTIVE_KEY_ID}

# Rate Limiting - Upstash Redis
UPSTASH_REDIS_REST_URL=${config.UPSTASH_REDIS_REST_URL}
UPSTASH_REDIS_REST_TOKEN=${config.UPSTASH_REDIS_REST_TOKEN}

# OAuth Providers
GOOGLE_CLIENT_ID=${config.GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${config.GOOGLE_CLIENT_SECRET}

# Email Provider - Resend
RESEND_API_KEY=${config.RESEND_API_KEY}
EMAIL_FROM=${config.EMAIL_FROM}
EMAIL_SERVER=${config.EMAIL_SERVER}
`;

  // Write apps/api/.env.local
  const apiEnvPath = resolve(process.cwd(), 'apps/api/.env.local');
  writeFileSync(apiEnvPath, envContent);
  success('Created apps/api/.env.local');

  // Write packages/database/.env.local
  const dbEnvPath = resolve(process.cwd(), 'packages/database/.env.local');
  const dbEnvContent = `DATABASE_URL="${config.DATABASE_URL}"\n`;
  writeFileSync(dbEnvPath, dbEnvContent);
  success('Created packages/database/.env.local');

  // Write apps/web/.env.local
  const webEnvPath = resolve(process.cwd(), 'apps/web/.env.local');
  const webEnvContent = `VITE_API_URL=http://localhost:3000\n`;
  writeFileSync(webEnvPath, webEnvContent);
  success('Created apps/web/.env.local');

  // ============================================================
  // STEP 8: Run Database Migrations
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 8: Database Setup');
  log('═══════════════════════════════════════════════════════════');

  const runMigrations = await question('Run database migrations now? (y/n): ');

  if (runMigrations.toLowerCase() === 'y') {
    info('Running Prisma migrations...');
    try {
      execSync('pnpm db:migrate', { stdio: 'inherit' });
      success('Database migrations complete!');
    } catch (error) {
      warning('Migration failed - you can run it manually later with: pnpm db:migrate');
    }
  } else {
    info('Skipped migrations - run later with: pnpm db:migrate');
  }

  // ============================================================
  // Summary
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('✨ Setup Complete!');
  log('═══════════════════════════════════════════════════════════');

  console.log('\n📋 Configuration Summary:');
  console.log('  ✅ Database (Neon) configured');
  console.log('  ✅ Auth secret generated');
  console.log('  ✅ Redis (Upstash) configured');
  console.log(`  ${setupGoogle.toLowerCase() === 'y' ? '✅' : '⏭️ '} Google OAuth ${setupGoogle.toLowerCase() === 'y' ? 'configured' : 'skipped'}`);
  console.log(`  ${setupEmail.toLowerCase() === 'y' ? '✅' : '⏭️ '} Resend email ${setupEmail.toLowerCase() === 'y' ? 'configured' : 'skipped'}`);

  log('📁 Files created:');
  console.log('  • apps/api/.env.local');
  console.log('  • packages/database/.env.local');
  console.log('  • apps/web/.env.local');

  log('🚀 Next steps:');
  console.log('  1. Start the development server:');
  console.log('     pnpm dev');
  console.log('');
  console.log('  2. Open http://localhost:5173 in your browser');
  console.log('');
  console.log('  3. Try logging in with credentials or Google OAuth');

  if (setupGoogle.toLowerCase() !== 'y') {
    log('💡 To add Google OAuth later:');
    console.log('  1. Get credentials from https://console.cloud.google.com');
    console.log('  2. Update GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in apps/api/.env.local');
  }

  if (setupEmail.toLowerCase() !== 'y') {
    log('💡 To add magic links later:');
    console.log('  1. Get API key from https://resend.com');
    console.log('  2. Update RESEND_API_KEY and EMAIL_FROM in apps/api/.env.local');
  }

  console.log('\n');
  rl.close();
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  rl.close();
  process.exit(1);
});

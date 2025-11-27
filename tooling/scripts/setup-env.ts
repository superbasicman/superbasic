#!/usr/bin/env tsx

/**
 * Interactive environment setup wizard
 * Configures all required environment variables for local development
 * 
 * Usage:
 *   pnpm tsx tooling/scripts/setup-env.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { generateKeyPairSync } from 'crypto';
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

function generateEd25519PrivateKeyBase64(): string {
  try {
    const { privateKey } = generateKeyPairSync('ed25519');
    return privateKey.export({ type: 'pkcs8', format: 'pem' }).toString('base64');
  } catch (error) {
    throw new Error(`Failed to generate Ed25519 key: ${(error as Error).message}`);
  }
}

function readEnvFile(path: string): Record<string, string> {
  try {
    const content = readFileSync(path, 'utf8');
    const env: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
    return env;
  } catch {
    return {};
  }
}

function getExistingValue(key: string, ...envs: Record<string, string>[]): string | undefined {
  for (const env of envs) {
    const value = env[key];
    if (value) return value;
  }
  return undefined;
}

function hasDocker(): boolean {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function hasLocalPostgresTools(): boolean {
  try {
    execSync('psql --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
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

  const existingApiEnv = readEnvFile(resolve(process.cwd(), 'apps/api/.env.local'));
  const existingDbEnv = readEnvFile(resolve(process.cwd(), 'packages/database/.env.local'));
  const existingWebEnv = readEnvFile(resolve(process.cwd(), 'apps/web/.env.local'));
  const existingApiTestEnv = readEnvFile(resolve(process.cwd(), 'apps/api/.env.test'));
  const existingDbTestEnv = readEnvFile(resolve(process.cwd(), 'packages/database/.env.test'));

  const config: Record<string, string> = {};

  // ============================================================
  // STEP 1: Database (Neon)
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 1: Database Configuration (Neon Postgres)');
  log('═══════════════════════════════════════════════════════════');

  const existingDatabaseUrl = getExistingValue(
    'DATABASE_URL',
    existingDbEnv,
    existingApiEnv
  );

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

  const databaseUrl = await question(
    `Paste dev branch connection string${existingDatabaseUrl ? " (or 's' to keep existing)" : ''}: `
  );

  if (databaseUrl.toLowerCase() === 's') {
    config.DATABASE_URL = existingDatabaseUrl ?? '';
    success(
      existingDatabaseUrl
        ? 'Using existing DATABASE_URL from .env.local'
        : 'No existing DATABASE_URL found; writing empty value'
    );
  } else {
    if (!databaseUrl.startsWith('postgresql://')) {
      warning('Connection string should start with postgresql:// - continuing anyway...');
    }

    config.DATABASE_URL = databaseUrl;
    success('Database configured!');
  }

  // ============================================================
  // STEP 2: Authentication Secret
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 2: Authentication Secret (Auth.js)');
  log('═══════════════════════════════════════════════════════════');

  const existingAuthSecret = getExistingValue('AUTH_SECRET', existingApiEnv);
  const authSecretChoice = await question(
    existingAuthSecret
      ? 'Generate a new AUTH_SECRET? (y = generate, s = skip and reuse existing): '
      : 'Generate a new AUTH_SECRET? (y = generate, s = keep empty): '
  );

  if (authSecretChoice.toLowerCase() === 's') {
    config.AUTH_SECRET = existingAuthSecret ?? '';
    success(
      existingAuthSecret
        ? 'Reused existing AUTH_SECRET from apps/api/.env.local'
        : 'AUTH_SECRET left empty'
    );
  } else {
    info('Generating a secure random secret for Auth.js...');
    const authSecret = generateSecret();
    config.AUTH_SECRET = authSecret;
    success('Auth secret generated!');
  }

  const existingTokenHashKeys = getExistingValue('TOKEN_HASH_KEYS', existingApiEnv);
  const existingTokenHashActiveKeyId = getExistingValue('TOKEN_HASH_ACTIVE_KEY_ID', existingApiEnv);
  const tokenHashChoice = await question(
    existingTokenHashKeys
      ? 'Generate new token hash keys? (y = generate, s = skip and reuse existing): '
      : 'Generate new token hash keys? (y = generate, s = keep empty): '
  );

  if (tokenHashChoice.toLowerCase() === 's') {
    config.TOKEN_HASH_KEYS = existingTokenHashKeys ?? '';
    config.TOKEN_HASH_ACTIVE_KEY_ID = existingTokenHashActiveKeyId ?? '';
    success(
      existingTokenHashKeys
        ? 'Reused existing token hash keys from apps/api/.env.local'
        : 'TOKEN_HASH_KEYS left empty'
    );
  } else {
    info('Generating token hashing key material...');
    const tokenHashKey = generateSecret();
    config.TOKEN_HASH_KEYS = JSON.stringify({ v1: tokenHashKey });
    config.TOKEN_HASH_ACTIVE_KEY_ID = 'v1';
    success('Token hashing keys configured!');
  }

  // ============================================================
  // STEP 3: Server Configuration
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 3: Server Configuration');
  log('═══════════════════════════════════════════════════════════');

  config.PORT = getExistingValue('PORT', existingApiEnv) ?? '3000';
  config.NODE_ENV = getExistingValue('NODE_ENV', existingApiEnv) ?? 'development';
  config.AUTH_URL = getExistingValue('AUTH_URL', existingApiEnv) ?? 'http://localhost:3000';
  config.AUTH_TRUST_HOST = getExistingValue('AUTH_TRUST_HOST', existingApiEnv) ?? 'true';
  config.WEB_APP_URL = getExistingValue('WEB_APP_URL', existingApiEnv) ?? 'http://localhost:5173';
  
  success('Server configuration loaded (existing values reused when present)');

  // ============================================================
  // STEP 3b: JWT Signing Key (Auth tokens)
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 3b: JWT Signing Key (Ed25519)');
  log('═══════════════════════════════════════════════════════════');

  const existingPrivateKey = getExistingValue('AUTH_JWT_PRIVATE_KEY', existingApiEnv);
  const existingKeyId = getExistingValue('AUTH_JWT_KEY_ID', existingApiEnv) ?? 'dev-access-key';
  const existingAlgorithm = getExistingValue('AUTH_JWT_ALGORITHM', existingApiEnv) ?? 'EdDSA';
  const existingIssuer = getExistingValue('AUTH_JWT_ISSUER', existingApiEnv) ?? config.AUTH_URL;
  const existingAudience =
    getExistingValue('AUTH_JWT_AUDIENCE', existingApiEnv) ?? `${config.AUTH_URL}/v1`;

  const jwtChoice = await question(
    existingPrivateKey
      ? 'Generate a new JWT signing key? (y = generate, s = skip and reuse existing): '
      : 'Generate a new JWT signing key? (y = generate, s = keep empty): '
  );

  if (jwtChoice.toLowerCase() === 's') {
    config.AUTH_JWT_ALGORITHM = existingAlgorithm;
    config.AUTH_JWT_KEY_ID = existingKeyId;
    config.AUTH_JWT_PRIVATE_KEY = existingPrivateKey ?? '';
    config.AUTH_JWT_ISSUER = existingIssuer;
    config.AUTH_JWT_AUDIENCE = existingAudience;
    success(
      existingPrivateKey
        ? 'Reused existing JWT signing key from apps/api/.env.local'
        : 'AUTH_JWT_PRIVATE_KEY left empty'
    );
  } else {
    info('Generating an Ed25519 private key for signing access tokens...');
    const authPrivateKey = generateEd25519PrivateKeyBase64();
    config.AUTH_JWT_ALGORITHM = 'EdDSA';
    config.AUTH_JWT_KEY_ID = 'dev-access-key';
    config.AUTH_JWT_PRIVATE_KEY = authPrivateKey;
    config.AUTH_JWT_ISSUER = config.AUTH_URL;
    config.AUTH_JWT_AUDIENCE = `${config.AUTH_URL}/v1`;

    success('JWT signing key generated (base64-encoded PEM). Keep this secret!');
  }

  // ============================================================
  // STEP 4: Rate Limiting (Upstash Redis)
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 4: Rate Limiting (Upstash Redis)');
  log('═══════════════════════════════════════════════════════════');

  const existingRedisUrl = getExistingValue('UPSTASH_REDIS_REST_URL', existingApiEnv);
  const existingRedisToken = getExistingValue('UPSTASH_REDIS_REST_TOKEN', existingApiEnv);

  info('Open https://console.upstash.com in your browser');
  console.log('  1. Sign in or create an account');
  console.log('  2. Click "Create Database" (if you don\'t have one)');
  console.log('  3. Choose a name and region');
  console.log('  4. Click on your database');
  console.log('  5. Scroll to "REST API" section');
  console.log('  6. Copy "UPSTASH_REDIS_REST_URL"');

  await question('\nPress Enter when ready to paste Redis URL...');

  const redisUrl = await question(
    `Paste UPSTASH_REDIS_REST_URL${existingRedisUrl ? " (or 's' to keep existing)" : ''}: `
  );

  if (redisUrl.toLowerCase() === 's') {
    if (!existingRedisUrl) {
      console.error('\n❌ No existing UPSTASH_REDIS_REST_URL found to reuse.');
      rl.close();
      return;
    }
    config.UPSTASH_REDIS_REST_URL = existingRedisUrl;
    success('Using existing UPSTASH_REDIS_REST_URL from apps/api/.env.local');
  } else {
    if (!redisUrl.startsWith('https://')) {
      warning('URL should start with https:// - continuing anyway...');
    }

    config.UPSTASH_REDIS_REST_URL = redisUrl;
  }

  log('Now copy the REST token:');
  console.log('  7. Copy "UPSTASH_REDIS_REST_TOKEN" (below the URL)');

  const redisToken = await question(
    `Paste UPSTASH_REDIS_REST_TOKEN${existingRedisToken ? " (or 's' to keep existing)" : ''}: `
  );
  if (redisToken.toLowerCase() === 's') {
    if (!existingRedisToken) {
      console.error('\n❌ No existing UPSTASH_REDIS_REST_TOKEN found to reuse.');
      rl.close();
      return;
    }
    config.UPSTASH_REDIS_REST_TOKEN = existingRedisToken;
    success('Using existing UPSTASH_REDIS_REST_TOKEN from apps/api/.env.local');
  } else {
    config.UPSTASH_REDIS_REST_TOKEN = redisToken;
  }

  success('Redis configured!');

  // ============================================================
  // STEP 5: Test Database Configuration (local recommended)
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 5: Test Database (local Postgres recommended)');
  log('═══════════════════════════════════════════════════════════');

  const defaultLocalTestDb =
    'postgresql://postgres:postgres@localhost:5432/superbasic_test';
  const existingTestDatabaseUrl = getExistingValue(
    'DATABASE_URL',
    existingApiTestEnv,
    existingDbTestEnv
  );

  console.log('\nChoose test DATABASE_URL:');
  console.log('  1) Local Postgres (recommended):', defaultLocalTestDb);
  if (config.DATABASE_URL) {
    console.log('  2) Reuse dev DATABASE_URL:', config.DATABASE_URL);
  }
  if (existingTestDatabaseUrl) {
    console.log('  s) Keep existing from .env.test:', existingTestDatabaseUrl);
  }

  const testDatabaseUrlInput = await question('Select option (1/2/s) or paste custom URL: ');
  if (testDatabaseUrlInput.toLowerCase() === 's') {
    config.TEST_DATABASE_URL = existingTestDatabaseUrl ?? '';
    success(
      existingTestDatabaseUrl
        ? 'Using existing test DATABASE_URL from .env.test'
        : 'Test DATABASE_URL left empty'
    );
  } else if (testDatabaseUrlInput === '1' || testDatabaseUrlInput.trim() === '') {
    config.TEST_DATABASE_URL = defaultLocalTestDb;
    success('Using local Postgres URL for tests');
  } else if (testDatabaseUrlInput === '2' && config.DATABASE_URL) {
    config.TEST_DATABASE_URL = config.DATABASE_URL;
    success('Reusing dev DATABASE_URL for tests');
  } else {
    config.TEST_DATABASE_URL = testDatabaseUrlInput;
    success('Custom test DATABASE_URL configured');
  }

  if (config.TEST_DATABASE_URL.includes('localhost')) {
    const dockerAvailable = hasDocker();
    const psqlAvailable = hasLocalPostgresTools();
    if (dockerAvailable) {
      const startDocker = await question(
        'Start a local Postgres container for tests now? (y/n): '
      );
      if (startDocker.toLowerCase() === 'y') {
        try {
          execSync(
            'docker run -d --name superbasic-pg-test -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=superbasic_test -p 5432:5432 postgres:16',
            { stdio: 'ignore' }
          );
          success('Started local Postgres container superbasic-pg-test on port 5432');
        } catch (error) {
          warning(
            `Failed to start Docker Postgres container: ${(error as Error).message}. Ensure a Postgres instance is running at ${config.TEST_DATABASE_URL}`
          );
        }
      } else {
        info('Skipping Docker startup. Ensure Postgres is running locally before running tests.');
      }
    } else if (!psqlAvailable) {
      warning(
        'No local Postgres detected (psql not found) and Docker is unavailable. Install Postgres locally (e.g., brew install postgresql@16 && brew services start postgresql@16 && createdb superbasic_test) or provide a reachable DATABASE_URL for tests.'
      );
    } else {
      info('Using existing local Postgres. Ensure superbasic_test database exists and is running.');
    }
  }

  // ============================================================
  // STEP 6: Google OAuth (Optional)
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 5: Google OAuth (Optional)');
  log('═══════════════════════════════════════════════════════════');

  const existingGoogleClientId = getExistingValue('GOOGLE_CLIENT_ID', existingApiEnv);
  const existingGoogleClientSecret = getExistingValue('GOOGLE_CLIENT_SECRET', existingApiEnv);
  const setupGoogle = await question(
    'Set up Google OAuth now? (y = enter new, n = leave empty, s = reuse existing): '
  );

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
  } else if (setupGoogle.toLowerCase() === 's') {
    config.GOOGLE_CLIENT_ID = existingGoogleClientId ?? '';
    config.GOOGLE_CLIENT_SECRET = existingGoogleClientSecret ?? '';
    success(
      existingGoogleClientId
        ? 'Reused existing Google OAuth credentials from apps/api/.env.local'
        : 'Google OAuth left empty'
    );
  } else {
    info('Skipping Google OAuth - leaving values empty');
    config.GOOGLE_CLIENT_ID = existingGoogleClientId ?? '';
    config.GOOGLE_CLIENT_SECRET = existingGoogleClientSecret ?? '';
  }

  // ============================================================
  // STEP 6: Email Provider (Resend) - Optional
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 6: Email Provider (Resend) - Optional');
  log('═══════════════════════════════════════════════════════════');

  const existingResendKey = getExistingValue('RESEND_API_KEY', existingApiEnv);
  const existingEmailFrom = getExistingValue('EMAIL_FROM', existingApiEnv);
  const existingEmailServer = getExistingValue('EMAIL_SERVER', existingApiEnv);

  const setupEmail = await question(
    'Set up Resend for magic links? (y = enter new, n = leave empty, s = reuse existing): '
  );

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
  } else if (setupEmail.toLowerCase() === 's') {
    config.RESEND_API_KEY = existingResendKey ?? '';
    config.EMAIL_FROM = existingEmailFrom ?? '';
    config.EMAIL_SERVER = existingEmailServer ?? '';
    success(
      existingResendKey
        ? 'Reused existing Resend configuration from apps/api/.env.local'
        : 'Resend configuration left empty'
    );
  } else {
    info('Skipping Resend - leaving values empty');
    config.RESEND_API_KEY = existingResendKey ?? '';
    config.EMAIL_FROM = existingEmailFrom ?? '';
    config.EMAIL_SERVER = existingEmailServer ?? '';
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
AUTH_JWT_ALGORITHM=${config.AUTH_JWT_ALGORITHM}
AUTH_JWT_KEY_ID=${config.AUTH_JWT_KEY_ID}
AUTH_JWT_PRIVATE_KEY=${config.AUTH_JWT_PRIVATE_KEY}
AUTH_JWT_ISSUER=${config.AUTH_JWT_ISSUER}
AUTH_JWT_AUDIENCE=${config.AUTH_JWT_AUDIENCE}

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
  const dbEnvContent = `DATABASE_URL=${config.DATABASE_URL}\n`;
  writeFileSync(dbEnvPath, dbEnvContent);
  success('Created packages/database/.env.local');

  // Write apps/web/.env.local
  const webEnvPath = resolve(process.cwd(), 'apps/web/.env.local');
  const webApiUrl = getExistingValue('VITE_API_URL', existingWebEnv) ?? 'http://localhost:3000';
  const webEnvContent = `VITE_API_URL=${webApiUrl}\n`;
  writeFileSync(webEnvPath, webEnvContent);
  success('Created apps/web/.env.local');

  // Write apps/api/.env.test (use local Postgres by default)
  const apiEnvTestPath = resolve(process.cwd(), 'apps/api/.env.test');
  const testEnvContent = `# Server Configuration
NODE_ENV=test

# Database
DATABASE_URL=${config.TEST_DATABASE_URL}

# Authentication
AUTH_SECRET=${config.AUTH_SECRET}
AUTH_URL=${config.AUTH_URL}
AUTH_TRUST_HOST=${config.AUTH_TRUST_HOST}
WEB_APP_URL=${config.WEB_APP_URL}
TOKEN_HASH_KEYS='${config.TOKEN_HASH_KEYS}'
TOKEN_HASH_ACTIVE_KEY_ID=${config.TOKEN_HASH_ACTIVE_KEY_ID}
AUTH_JWT_ALGORITHM=${config.AUTH_JWT_ALGORITHM}
AUTH_JWT_KEY_ID=${config.AUTH_JWT_KEY_ID}
AUTH_JWT_PRIVATE_KEY=${config.AUTH_JWT_PRIVATE_KEY}
AUTH_JWT_ISSUER=${config.AUTH_JWT_ISSUER}
AUTH_JWT_AUDIENCE=${config.AUTH_JWT_AUDIENCE}

# Rate Limiting
UPSTASH_REDIS_REST_URL=${config.UPSTASH_REDIS_REST_URL ?? ''}
UPSTASH_REDIS_REST_TOKEN=${config.UPSTASH_REDIS_REST_TOKEN ?? ''}

# Email Provider - Resend
RESEND_API_KEY=${config.RESEND_API_KEY ?? ''}
EMAIL_FROM=${config.EMAIL_FROM ?? ''}
EMAIL_SERVER=${config.EMAIL_SERVER ?? ''}
`;
  writeFileSync(apiEnvTestPath, testEnvContent);
  success('Created apps/api/.env.test');

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
  const googleConfigured =
    setupGoogle.toLowerCase() === 'y' ||
    (setupGoogle.toLowerCase() === 's' &&
      Boolean(config.GOOGLE_CLIENT_ID || config.GOOGLE_CLIENT_SECRET));

  const emailConfigured =
    setupEmail.toLowerCase() === 'y' ||
    (setupEmail.toLowerCase() === 's' &&
      Boolean(config.RESEND_API_KEY || config.EMAIL_FROM || config.EMAIL_SERVER));

  const redisConfigured = Boolean(config.UPSTASH_REDIS_REST_URL || config.UPSTASH_REDIS_REST_TOKEN);
  const dbConfigured = Boolean(config.DATABASE_URL);
  const authSecretConfigured = Boolean(config.AUTH_SECRET);

  log('═══════════════════════════════════════════════════════════');
  log('✨ Setup Complete!');
  log('═══════════════════════════════════════════════════════════');

  console.log('\n📋 Configuration Summary:');
  console.log(`  ${dbConfigured ? '✅' : '⚠️ '} Database (Neon) ${dbConfigured ? 'configured' : 'missing'}`);
  console.log(`  ${authSecretConfigured ? '✅' : '⚠️ '} Auth secret ${authSecretConfigured ? 'set' : 'empty'}`);
  console.log(`  ${redisConfigured ? '✅' : '⏭️ '} Redis (Upstash) ${redisConfigured ? 'configured' : 'skipped/empty'}`);
  console.log(`  ${googleConfigured ? '✅' : '⏭️ '} Google OAuth ${googleConfigured ? 'configured' : 'skipped/empty'}`);
  console.log(`  ${emailConfigured ? '✅' : '⏭️ '} Resend email ${emailConfigured ? 'configured' : 'skipped/empty'}`);

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

  if (!googleConfigured) {
    log('💡 To add Google OAuth later:');
    console.log('  1. Get credentials from https://console.cloud.google.com');
    console.log('  2. Update GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in apps/api/.env.local');
  }

  if (!emailConfigured) {
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

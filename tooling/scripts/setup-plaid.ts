#!/usr/bin/env tsx

/**
 * Interactive Plaid setup wizard
 * Walks through Plaid account registration, API key setup, and encryption key generation
 * Updates .env files with Plaid configuration
 * 
 * Usage:
 *   pnpm setup:plaid
 *   OR
 *   pnpm tsx tooling/scripts/setup-plaid.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
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

function error(message: string) {
  console.log(`\n❌ ${message}`);
}

function generateEncryptionKey(): string {
  try {
    // Generate a 256-bit (32-byte) key for AES-256-GCM encryption
    return execSync('openssl rand -base64 32').toString().trim();
  } catch {
    // Fallback if openssl not available
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    return Array.from({ length: 44 }, () => 
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  }
}

function readEnvFile(filePath: string): Map<string, string> {
  const envMap = new Map<string, string>();
  
  if (!existsSync(filePath)) {
    return envMap;
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse KEY=VALUE (handle quoted values)
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      // Remove surrounding quotes if present
      const cleanValue = value.replace(/^["']|["']$/g, '');
      envMap.set(key.trim(), cleanValue);
    }
  }

  return envMap;
}

function writeEnvFile(filePath: string, envMap: Map<string, string>, updates: Record<string, string>) {
  // Update map with new values
  for (const [key, value] of Object.entries(updates)) {
    envMap.set(key, value);
  }

  // Build content preserving comments and structure if file exists
  let content = '';
  
  if (existsSync(filePath)) {
    const originalContent = readFileSync(filePath, 'utf-8');
    const lines = originalContent.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Keep comments and empty lines as-is
      if (!trimmed || trimmed.startsWith('#')) {
        content += line + '\n';
        continue;
      }

      // Update existing keys
      const match = trimmed.match(/^([^=]+)=/);
      if (match) {
        const key = match[1].trim();
        if (envMap.has(key)) {
          // Check if value needs quotes (contains spaces)
          const value = envMap.get(key)!;
          const needsQuotes = value.includes(' ');
          content += `${key}=${needsQuotes ? `"${value}"` : value}\n`;
          envMap.delete(key); // Mark as written
        } else {
          content += line + '\n';
        }
      } else {
        content += line + '\n';
      }
    }
  }

  // Add new keys at the end
  if (envMap.size > 0) {
    if (content && !content.endsWith('\n\n')) {
      content += '\n';
    }
    content += '\n# Plaid Configuration\n';
    for (const [key, value] of envMap.entries()) {
      const needsQuotes = value.includes(' ');
      content += `${key}=${needsQuotes ? `"${value}"` : value}\n`;
    }
  }

  writeFileSync(filePath, content);
}

async function main() {
  console.clear();
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  SuperBasic Finance - Plaid Setup Wizard                  ║');
  console.log('║  Configure Plaid Link for bank connections                ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  log('This wizard will help you:');
  console.log('  1. Register for a Plaid developer account (if needed)');
  console.log('  2. Obtain Plaid Sandbox API credentials');
  console.log('  3. Generate encryption key for access tokens');
  console.log('  4. Configure environment variables');
  console.log('  5. Verify Plaid SDK installation');

  const proceed = await question('\nReady to start? (y/n): ');
  if (proceed.toLowerCase() !== 'y') {
    console.log('\nSetup cancelled.');
    rl.close();
    return;
  }

  const config: Record<string, string> = {};

  // ============================================================
  // STEP 1: Plaid Account Registration
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 1: Plaid Developer Account');
  log('═══════════════════════════════════════════════════════════');

  const hasAccount = await question('Do you have a Plaid developer account? (y/n): ');

  if (hasAccount.toLowerCase() !== 'y') {
    info('Opening Plaid signup page...');
    console.log('\n🌐 Visit: https://dashboard.plaid.com/signup');
    console.log('\n  1. Click "Sign up"');
    console.log('  2. Fill in your details');
    console.log('  3. Verify your email address');
    console.log('  4. Complete the onboarding questionnaire');
    console.log('  5. Choose "Sandbox" access for development');
    
    await question('\nPress Enter once you\'ve created your account...');
  }

  success('Plaid account ready!');

  // ============================================================
  // STEP 2: Environment Selection
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 2: Choose Plaid Environment');
  log('═══════════════════════════════════════════════════════════');

  info('Plaid offers three environments:');
  console.log('  • Sandbox    - Free, for testing (recommended for development)');
  console.log('  • Development - Limited free usage, real bank connections');
  console.log('  • Production  - Live environment (requires approval)');

  log('For Phase 4 development, we recommend starting with Sandbox.');
  
  const environment = await question('\nWhich environment? (sandbox/development/production) [sandbox]: ');
  const plaidEnv = environment.toLowerCase() || 'sandbox';
  
  if (!['sandbox', 'development', 'production'].includes(plaidEnv)) {
    error('Invalid environment. Must be: sandbox, development, or production');
    rl.close();
    return;
  }

  config.PLAID_ENV = plaidEnv;
  success(`Selected ${plaidEnv} environment`);

  // ============================================================
  // STEP 3: Plaid API Credentials
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 3: Plaid API Credentials');
  log('═══════════════════════════════════════════════════════════');

  info('Now let\'s get your API credentials from the Plaid dashboard:');
  console.log('\n🌐 Visit: https://dashboard.plaid.com/team/keys');
  console.log('\n  1. Sign in to your Plaid account');
  console.log('  2. Navigate to "Team Settings" → "Keys"');
  console.log(`  3. Find your ${plaidEnv.toUpperCase()} credentials`);
  console.log('  4. Copy the client_id');
  console.log('  5. Copy the secret (click "Show" if hidden)');

  info('Your client_id looks like: 63f1a2b3c4d5e6f7g8h9i0j1');
  info('Your secret looks like: abcdef1234567890abcdef1234567890');

  await question('\nPress Enter when ready to paste credentials...');

  const clientId = await question('\nPaste your Plaid CLIENT_ID: ');
  
  if (!clientId || clientId.length < 10) {
    error('Invalid client_id. It should be a long alphanumeric string.');
    rl.close();
    return;
  }

  config.PLAID_CLIENT_ID = clientId;

  const secret = await question('Paste your Plaid SECRET: ');
  
  if (!secret || secret.length < 10) {
    error('Invalid secret. It should be a long alphanumeric string.');
    rl.close();
    return;
  }

  config.PLAID_SECRET = secret;

  success('Plaid API credentials configured!');

  // ============================================================
  // STEP 4: Encryption Key Generation
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 4: Access Token Encryption Key');
  log('═══════════════════════════════════════════════════════════');

  info('Plaid access tokens must be encrypted before storing in the database.');
  console.log('  • This uses AES-256-GCM encryption');
  console.log('  • Requires a 256-bit (32-byte) encryption key');
  console.log('  • Key will be base64-encoded for storage');

  log('Generating a secure encryption key...');
  const encryptionKey = generateEncryptionKey();
  config.PLAID_ACCESS_TOKEN_ENCRYPTION_KEY = encryptionKey;
  
  success('Encryption key generated!');
  warning('IMPORTANT: Keep this key secure. If lost, you cannot decrypt existing tokens.');

  // ============================================================
  // STEP 5: Plaid Products Configuration
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 5: Plaid Products');
  log('═══════════════════════════════════════════════════════════');

  info('Plaid offers various products. For SuperBasic Finance Phase 4, we need:');
  console.log('  • transactions - Access transaction history');
  console.log('  • auth - Account and routing numbers (optional)');
  console.log('  • balance - Real-time balance information (optional)');

  log('Default configuration: transactions');
  
  const customizeProducts = await question('\nCustomize products? (y/n) [n]: ');
  
  if (customizeProducts.toLowerCase() === 'y') {
    const useAuth = await question('Include auth product? (y/n): ');
    const useBalance = await question('Include balance product? (y/n): ');
    
    const products = ['transactions'];
    if (useAuth.toLowerCase() === 'y') products.push('auth');
    if (useBalance.toLowerCase() === 'y') products.push('balance');
    
    config.PLAID_PRODUCTS = products.join(',');
  } else {
    config.PLAID_PRODUCTS = 'transactions';
  }

  success(`Plaid products configured: ${config.PLAID_PRODUCTS}`);

  // ============================================================
  // STEP 6: Country Codes
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 6: Country Codes');
  log('═══════════════════════════════════════════════════════════');

  info('Specify which countries your users can connect banks from:');
  console.log('  • US - United States');
  console.log('  • CA - Canada');
  console.log('  • GB - United Kingdom');
  console.log('  • EU - European countries');

  const countryCodes = await question('\nEnter country codes (comma-separated) [US]: ');
  config.PLAID_COUNTRY_CODES = countryCodes || 'US';

  success(`Country codes configured: ${config.PLAID_COUNTRY_CODES}`);

  // ============================================================
  // STEP 7: Redirect URI (for OAuth banks)
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 7: OAuth Redirect URI');
  log('═══════════════════════════════════════════════════════════');

  info('Some banks require OAuth authentication. You need to configure a redirect URI.');
  console.log('\n  • Development: http://localhost:5173/oauth/callback');
  console.log('  • Production: https://app.yourdomain.com/oauth/callback');

  log('For development, we\'ll use: http://localhost:5173/oauth/callback');
  
  const customRedirect = await question('\nUse custom redirect URI? (y/n) [n]: ');
  
  if (customRedirect.toLowerCase() === 'y') {
    const redirectUri = await question('Enter redirect URI: ');
    config.PLAID_REDIRECT_URI = redirectUri;
  } else {
    config.PLAID_REDIRECT_URI = 'http://localhost:5173/oauth/callback';
  }

  info('You must also add this URI in the Plaid dashboard:');
  console.log('\n🌐 Visit: https://dashboard.plaid.com/team/api');
  console.log(`  1. Go to "API" → "Allowed redirect URIs"`);
  console.log(`  2. Add: ${config.PLAID_REDIRECT_URI}`);
  console.log('  3. Click "Save"');

  await question('\nPress Enter after adding the redirect URI in Plaid dashboard...');

  success('Redirect URI configured!');

  // ============================================================
  // STEP 8: Webhook Configuration (Optional)
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 8: Webhook Configuration (Optional)');
  log('═══════════════════════════════════════════════════════════');

  info('Plaid can send webhooks for:');
  console.log('  • New transactions available');
  console.log('  • Connection status changes');
  console.log('  • Item updates required');

  const setupWebhook = await question('\nConfigure webhook URL now? (y/n) [n]: ');

  if (setupWebhook.toLowerCase() === 'y') {
    log('For local development, you can use ngrok or a similar tunneling service:');
    console.log('  • ngrok http 3000');
    console.log('  • Use the HTTPS URL provided');
    
    const webhookUrl = await question('\nEnter webhook URL (must be HTTPS): ');
    
    if (webhookUrl && webhookUrl.startsWith('https://')) {
      config.PLAID_WEBHOOK_URL = webhookUrl;
      
      info('You must also add this in the Plaid dashboard:');
      console.log('\n🌐 Visit: https://dashboard.plaid.com/team/api');
      console.log('  1. Go to "API" → "Webhooks"');
      console.log(`  2. Add: ${webhookUrl}/v1/webhooks/plaid`);
      console.log('  3. Click "Save"');
      
      await question('\nPress Enter after adding the webhook in Plaid dashboard...');
      success('Webhook URL configured!');
    } else {
      warning('Invalid URL (must start with https://) - skipping webhook setup');
    }
  } else {
    info('Skipping webhook setup - you can add it later');
  }

  // ============================================================
  // STEP 9: Write Configuration Files
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 9: Writing Configuration Files');
  log('═══════════════════════════════════════════════════════════');

  const apiEnvPath = resolve(process.cwd(), 'apps/api/.env.local');
  
  if (!existsSync(apiEnvPath)) {
    warning('apps/api/.env.local not found. Creating new file...');
    warning('You may need to run: pnpm setup:env first');
  }

  // Read existing env file
  const existingEnv = readEnvFile(apiEnvPath);

  // Prepare Plaid configuration
  const plaidConfig: Record<string, string> = {
    PLAID_ENV: config.PLAID_ENV,
    PLAID_CLIENT_ID: config.PLAID_CLIENT_ID,
    PLAID_SECRET: config.PLAID_SECRET,
    PLAID_ACCESS_TOKEN_ENCRYPTION_KEY: config.PLAID_ACCESS_TOKEN_ENCRYPTION_KEY,
    PLAID_PRODUCTS: config.PLAID_PRODUCTS,
    PLAID_COUNTRY_CODES: config.PLAID_COUNTRY_CODES,
    PLAID_REDIRECT_URI: config.PLAID_REDIRECT_URI,
  };

  if (config.PLAID_WEBHOOK_URL) {
    plaidConfig.PLAID_WEBHOOK_URL = config.PLAID_WEBHOOK_URL;
  }

  // Write updated env file
  writeEnvFile(apiEnvPath, existingEnv, plaidConfig);
  success('Updated apps/api/.env.local with Plaid configuration');

  // Note about quick reference guide
  info('Plaid quick reference guide available at: .plaid-setup-reference.md');
  success('Configuration complete!');

  // ============================================================
  // STEP 10: Verify Plaid SDK Installation
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 10: Verify Plaid SDK Installation');
  log('═══════════════════════════════════════════════════════════');

  const verifyInstall = await question('Check if Plaid SDK is installed? (y/n) [y]: ');

  if (verifyInstall.toLowerCase() !== 'n') {
    info('Checking for plaid package...');
    
    try {
      // Check if plaid is in package.json
      const packageJsonPath = resolve(process.cwd(), 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      
      const hasPlaid = 
        (packageJson.dependencies && packageJson.dependencies.plaid) ||
        (packageJson.devDependencies && packageJson.devDependencies.plaid);

      if (hasPlaid) {
        success('Plaid SDK is installed!');
      } else {
        warning('Plaid SDK not found in package.json');
        
        const installNow = await question('\nInstall Plaid SDK now? (y/n): ');
        
        if (installNow.toLowerCase() === 'y') {
          info('Installing plaid...');
          try {
            execSync('pnpm add plaid', { stdio: 'inherit' });
            success('Plaid SDK installed successfully!');
          } catch (err) {
            error('Failed to install Plaid SDK. Run manually: pnpm add plaid');
          }
        } else {
          info('You can install it later with: pnpm add plaid');
        }
      }
    } catch (err) {
      warning('Could not verify installation - you may need to install manually');
    }
  }

  // ============================================================
  // STEP 11: Test Connection (Optional)
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('STEP 11: Test Plaid Connection (Optional)');
  log('═══════════════════════════════════════════════════════════');

  const testConnection = await question('Test Plaid API connection now? (y/n) [n]: ');

  if (testConnection.toLowerCase() === 'y') {
    info('Creating a simple test script...');
    
    const testScript = `
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

const configuration = new Configuration({
  basePath: PlaidEnvironments.${plaidEnv},
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': '${config.PLAID_CLIENT_ID}',
      'PLAID-SECRET': '${config.PLAID_SECRET}',
    },
  },
});

const client = new PlaidApi(configuration);

// Test by creating a link token
client.linkTokenCreate({
  user: { client_user_id: 'test-user' },
  client_name: 'SuperBasic Finance',
  products: ['${config.PLAID_PRODUCTS.split(',')[0]}'],
  country_codes: ['${config.PLAID_COUNTRY_CODES.split(',')[0]}'],
  language: 'en',
})
  .then(() => {
    console.log('✅ Plaid API connection successful!');
  })
  .catch((err) => {
    console.error('❌ Plaid API connection failed:', err.response?.data || err.message);
  });
`;

    const testPath = resolve(process.cwd(), 'tooling/scripts/temp/test-plaid-connection.ts');
    writeFileSync(testPath, testScript);
    
    try {
      info('Running test...');
      execSync(`pnpm tsx ${testPath}`, { stdio: 'inherit' });
    } catch (err) {
      warning('Test failed - check your credentials and try again');
    }
  }

  // ============================================================
  // Summary
  // ============================================================
  log('═══════════════════════════════════════════════════════════');
  log('✨ Plaid Setup Complete!');
  log('═══════════════════════════════════════════════════════════');

  console.log('\n📋 Configuration Summary:');
  console.log(`  ✅ Environment: ${config.PLAID_ENV}`);
  console.log(`  ✅ Client ID: ${config.PLAID_CLIENT_ID.substring(0, 10)}...`);
  console.log(`  ✅ Secret: ${config.PLAID_SECRET.substring(0, 10)}...`);
  console.log(`  ✅ Encryption key generated`);
  console.log(`  ✅ Products: ${config.PLAID_PRODUCTS}`);
  console.log(`  ✅ Countries: ${config.PLAID_COUNTRY_CODES}`);
  console.log(`  ✅ Redirect URI: ${config.PLAID_REDIRECT_URI}`);
  if (config.PLAID_WEBHOOK_URL) {
    console.log(`  ✅ Webhook URL: ${config.PLAID_WEBHOOK_URL}`);
  }

  log('📁 Files updated:');
  console.log('  • apps/api/.env.local (Plaid configuration added)');
  console.log('  • .plaid-setup-reference.md (Quick reference guide)');

  log('🚀 Next steps:');
  console.log('  1. Start implementing Plaid integration (Phase 4)');
  console.log('     See: .kiro/specs/plaid-bank-connections/');
  console.log('');
  console.log('  2. Create database schema for connections and accounts');
  console.log('     Run: pnpm db:migrate');
  console.log('');
  console.log('  3. Implement Plaid client wrapper in packages/core');
  console.log('');
  console.log('  4. Create API endpoints for Link token and public token exchange');
  console.log('');
  console.log('  5. Test with Plaid Sandbox credentials:');
  console.log('     Username: user_good');
  console.log('     Password: pass_good');

  log('📚 Helpful resources:');
  console.log('  • Plaid Dashboard: https://dashboard.plaid.com');
  console.log('  • Plaid Docs: https://plaid.com/docs/');
  console.log('  • Plaid Quickstart: https://plaid.com/docs/quickstart/');
  console.log('  • Plaid Sandbox: https://plaid.com/docs/sandbox/');

  log('⚠️  Security reminders:');
  console.log('  • Never commit .env.local files to git');
  console.log('  • Keep your encryption key secure and backed up');
  console.log('  • Use Sandbox for development, Development/Production for real usage');
  console.log('  • Rotate credentials if compromised');

  console.log('\n');
  rl.close();
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  rl.close();
  process.exit(1);
});

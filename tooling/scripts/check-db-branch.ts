#!/usr/bin/env tsx

/**
 * Check which Neon database branch is currently configured
 * 
 * Usage:
 *   pnpm tsx tooling/scripts/check-db-branch.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read .env.local file manually
const envPath = resolve(process.cwd(), 'apps/api/.env.local');
let databaseUrl: string | undefined;

try {
  const envContent = readFileSync(envPath, 'utf-8');
  const match = envContent.match(/^DATABASE_URL=(.+)$/m);
  databaseUrl = match?.[1];
} catch (error) {
  console.error('❌ Could not read apps/api/.env.local');
  process.exit(1);
}

if (!databaseUrl) {
  console.error('❌ DATABASE_URL not found in environment');
  console.error('   Check apps/api/.env.local exists and has DATABASE_URL set');
  process.exit(1);
}

// Extract hostname from connection string
// Format: postgresql://user:password@hostname/database?params
const match = databaseUrl.match(/@([^/]+)\//);

if (!match) {
  console.error('❌ Could not parse DATABASE_URL');
  console.error('   Expected format: postgresql://user:password@hostname/database');
  process.exit(1);
}

const hostname = match[1];

console.log('\n🔍 Database Connection Check\n');
console.log('Connection String:', databaseUrl.replace(/:[^:@]+@/, ':****@')); // Mask password
console.log('Hostname:', hostname);

// Try to determine branch from hostname
// Neon branch hostnames typically look like: ep-xxx-pooler.region.aws.neon.tech
// Different branches have different ep-xxx identifiers

if (hostname.includes('neon.tech')) {
  console.log('\n✅ Connected to Neon database');
  
  // Extract the endpoint identifier (ep-xxx part)
  const epMatch = hostname.match(/ep-([^-]+)/);
  if (epMatch) {
    const epId = epMatch[0]; // e.g., "ep-curly-frog"
    console.log('Endpoint ID:', epId);
    console.log('\n💡 To verify which branch this is:');
    console.log('   1. Go to https://console.neon.tech');
    console.log('   2. Select your project');
    console.log('   3. Click "Branches"');
    console.log(`   4. Look for branch with hostname containing "${epId}"`);
  }
} else {
  console.log('\n⚠️  Not a Neon database (or hostname format unexpected)');
}

console.log('\n📋 Expected Configuration:');
console.log('   Local Development: Should use "dev" branch');
console.log('   Vercel Production: Should use "main" branch');
console.log('   Vercel Preview: Should use "dev" branch');
console.log('');

#!/usr/bin/env node
/**
 * Simple DB connectivity check using DATABASE_URL from apps/api/.env.test (fallback .env.local).
 * Usage: pnpm check-db-connection
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { resolve as resolvePath } from 'node:path';

// Resolve @prisma/client via the database package to avoid hoisting issues
const requireFromDatabase = createRequire(resolvePath('packages/database/package.json'));
const { PrismaClient } = requireFromDatabase('@prisma/client');

function loadDatabaseUrl() {
  const envPaths = [
    resolve(process.cwd(), 'apps/api/.env.test'),
    resolve(process.cwd(), 'apps/api/.env.local'),
  ];

  for (const path of envPaths) {
    try {
      const content = readFileSync(path, 'utf-8');
      const match = content.match(/^DATABASE_URL=(.+)$/m);
      if (match?.[1]) {
        return match[1].trim();
      }
    } catch {
      // ignore and continue
    }
  }

  throw new Error('DATABASE_URL not found in apps/api/.env.test or .env.local');
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL || loadDatabaseUrl();
  const masked = databaseUrl.replace(/:[^:@]+@/, ':****@');
  console.log('Checking database connectivity to:', masked);

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const result = await prisma.$queryRaw`select now() as now`;
    const now = Array.isArray(result) ? result[0]?.now : undefined;
    console.log('✅ Connected. Server time:', now);
  } catch (error) {
    console.error('❌ Failed to connect:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

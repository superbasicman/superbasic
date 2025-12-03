#!/usr/bin/env tsx
/**
 * Idempotently seed OAuth clients (mobile + web dashboard) for PKCE flows.
 *
 * Usage:
 *   DATABASE_URL="..." pnpm db:seed-oauth
 *
 * Env overrides:
 *   OAUTH_CLIENT_ID / OAUTH_REDIRECT_URIS for the mobile client
 *   WEB_OAUTH_CLIENT_ID / WEB_OAUTH_REDIRECT_URIS for the web dashboard
 */

import process from 'node:process';
import { PrismaClient } from '@repo/database';

const prisma = new PrismaClient();

type SeedConfig = {
  clientId: string;
  name: string;
  redirectUris: string[];
  type?: 'public' | 'confidential';
};

function normalizeRedirectUris(envValue: string | undefined, fallback: string[]): string[] {
  const uris = Array.from(
    new Set(
      (envValue ?? fallback.join(','))
        .split(',')
        .map((uri) => uri.trim())
        .filter(Boolean)
    )
  );

  if (uris.length === 0) {
    throw new Error('At least one redirect URI must be provided for each OAuth client');
  }

  return uris;
}

function buildSeedConfigs(): SeedConfig[] {
  const mobile: SeedConfig = {
    clientId: (process.env.OAUTH_CLIENT_ID ?? 'mobile').trim(),
    name: process.env.OAUTH_CLIENT_NAME?.trim() || 'SuperBasic Mobile',
    redirectUris: normalizeRedirectUris(process.env.OAUTH_REDIRECT_URIS, [
      'sb://callback',
      'http://localhost:3000/v1/auth/callback/mobile',
    ]),
    type: 'public',
  };

  const webDashboard: SeedConfig = {
    clientId: (process.env.WEB_OAUTH_CLIENT_ID ?? 'web-dashboard').trim(),
    name: process.env.WEB_OAUTH_CLIENT_NAME?.trim() || 'SuperBasic Web Dashboard',
    redirectUris: normalizeRedirectUris(process.env.WEB_OAUTH_REDIRECT_URIS, [
      'http://localhost:5173/auth/callback',
    ]),
    type: 'public',
  };

  const deduped: Record<string, SeedConfig> = {};
  [mobile, webDashboard].forEach((config) => {
    if (!config.clientId) {
      throw new Error('Client IDs must not be empty');
    }
    deduped[config.clientId] = config;
  });

  return Object.values(deduped);
}

async function seedClient(config: SeedConfig): Promise<void> {
  await prisma.oAuthClient.upsert({
    where: { clientId: config.clientId },
    update: {
      name: config.name,
      type: config.type ?? 'public',
      redirectUris: config.redirectUris,
      disabledAt: null,
    },
    create: {
      clientId: config.clientId,
      name: config.name,
      type: config.type ?? 'public',
      redirectUris: config.redirectUris,
    },
  });

  const record = await prisma.oAuthClient.findUnique({
    where: { clientId: config.clientId },
  });

  console.log(
    `Seeded OAuth client "${config.clientId}" (${config.name}) with redirect URIs: ${config.redirectUris.join(
      ', '
    )} (grant types: ${(config.allowedGrantTypes ?? ['authorization_code', 'refresh_token']).join(', ')})`
  );

  if (!record) {
    throw new Error(`Failed to verify OAuth client "${config.clientId}" after seeding`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to seed OAuth clients');
  }

  const configs = buildSeedConfigs();
  for (const config of configs) {
    await seedClient(config);
  }
}

main()
  .catch((error) => {
    console.error('Failed to seed OAuth clients', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

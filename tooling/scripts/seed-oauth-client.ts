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
  isFirstParty?: boolean;
  allowedGrantTypes?: ('authorization_code' | 'refresh_token' | 'client_credentials' | 'device_code')[];
  allowedScopes?: string[];
  tokenEndpointAuthMethod?: 'none' | 'client_secret_post' | 'client_secret_basic' | 'private_key_jwt';
};

function normalizeRedirectUris(envValue: string | undefined, fallback: string[], allowEmpty = false): string[] {
  const uris = Array.from(
    new Set(
      (envValue ?? fallback.join(','))
        .split(',')
        .map((uri) => uri.trim())
        .filter(Boolean)
    )
  );

  if (uris.length === 0 && !allowEmpty) {
    throw new Error('At least one redirect URI must be provided for each OAuth client');
  }

  return uris;
}

function buildSeedConfigs(): SeedConfig[] {
  const additionalUris = normalizeRedirectUris(process.env.ADDITIONAL_REDIRECT_URIS, [], true);

  const mobileApp: SeedConfig = {
    clientId: (process.env.OAUTH_CLIENT_ID ?? 'mobile-app').trim(),
    name: process.env.OAUTH_CLIENT_NAME?.trim() || 'SuperBasic Mobile App',
    redirectUris: normalizeRedirectUris(process.env.OAUTH_REDIRECT_URIS, [
      'superbasic://auth/callback',
    ]),
    type: 'public',
    isFirstParty: true,
    allowedGrantTypes: ['authorization_code', 'refresh_token'],
    allowedScopes: [
      // OIDC scopes for identity claims
      'openid',
      'profile',
      'email',
      // App scopes for API authorization (per auth-goal 5.17)
      'read:accounts',
      'write:accounts',
      'read:transactions',
      'write:transactions',
      'manage:members',
      'admin',
    ],
    tokenEndpointAuthMethod: 'none',
  };

  const webSpa: SeedConfig = {
    clientId: (process.env.WEB_OAUTH_CLIENT_ID ?? 'web-spa').trim(),
    name: process.env.WEB_OAUTH_CLIENT_NAME?.trim() || 'SuperBasic Web SPA',
    redirectUris: [
      ...normalizeRedirectUris(process.env.WEB_OAUTH_REDIRECT_URIS, [
        'http://localhost:8081/auth/callback',
        'https://app.superbasic.com/auth/callback',
      ]),
      ...additionalUris,
    ],
    type: 'public',
    isFirstParty: true,
    allowedGrantTypes: ['authorization_code', 'refresh_token'],
    allowedScopes: [
      // OIDC scopes for identity claims
      'openid',
      'profile',
      'email',
      // App scopes for API authorization (per auth-goal 5.17)
      'read:accounts',
      'write:accounts',
      'read:transactions',
      'write:transactions',
      'manage:members',
      'admin',
    ],
    tokenEndpointAuthMethod: 'none',
  };

  const deduped: Record<string, SeedConfig> = {};
  [mobileApp, webSpa].forEach((config) => {
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
      clientType: config.type ?? 'public',
      redirectUris: config.redirectUris,
      isFirstParty: config.isFirstParty ?? false,
      allowedGrantTypes: config.allowedGrantTypes ?? ['authorization_code', 'refresh_token'],
      allowedScopes: config.allowedScopes ?? [],
      tokenEndpointAuthMethod: config.tokenEndpointAuthMethod ?? 'none',
      disabledAt: null,
    },
    create: {
      clientId: config.clientId,
      name: config.name,
      clientType: config.type ?? 'public',
      redirectUris: config.redirectUris,
      isFirstParty: config.isFirstParty ?? false,
      allowedGrantTypes: config.allowedGrantTypes ?? ['authorization_code', 'refresh_token'],
      allowedScopes: config.allowedScopes ?? [],
      tokenEndpointAuthMethod: config.tokenEndpointAuthMethod ?? 'none',
    },
  });

  const record = await prisma.oAuthClient.findUnique({
    where: { clientId: config.clientId },
  });

  console.log(
    `Seeded OAuth client "${config.clientId}" (${config.name})\n` +
    `  - Redirect URIs: ${config.redirectUris.join(', ')}\n` +
    `  - Grant types: ${(config.allowedGrantTypes ?? ['authorization_code', 'refresh_token']).join(', ')}\n` +
    `  - Scopes: ${(config.allowedScopes ?? []).join(', ')}\n` +
    `  - Auth method: ${config.tokenEndpointAuthMethod ?? 'none'}\n` +
    `  - First party: ${config.isFirstParty ?? false}`
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

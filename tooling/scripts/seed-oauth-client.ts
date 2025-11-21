#!/usr/bin/env tsx
/**
 * Idempotently seed the default OAuth client used for mobile PKCE.
 *
 * Usage:
 *   DATABASE_URL="..." pnpm db:seed-oauth
 */

import process from 'node:process';
import { PrismaClient } from '@repo/database';

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to seed OAuth clients');
  }

  const clientId = process.env.OAUTH_CLIENT_ID ?? 'mobile';
  const redirectUris = (
    process.env.OAUTH_REDIRECT_URIS ?? 'sb://callback,http://localhost:3000/v1/auth/callback/mobile'
  )
    .split(',')
    .map((uri) => uri.trim())
    .filter(Boolean);

  await prisma.oAuthClient.upsert({
    where: { clientId },
    update: {
      type: 'public',
      redirectUris,
      disabledAt: null,
    },
    create: {
      clientId,
      name: 'SuperBasic Mobile',
      type: 'public',
      redirectUris,
    },
  });

  console.log(
    `Seeded OAuth client "${clientId}" with redirect URIs: ${redirectUris.join(', ')}`
  );
}

main()
  .catch((error) => {
    console.error('Failed to seed OAuth client', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

#!/usr/bin/env tsx
/**
 * Backfill profiles for existing users
 * 
 * This script creates a profile for each user that doesn't have one.
 * Run after adding the profiles table to ensure data integrity.
 * 
 * Usage:
 *   DATABASE_URL="..." pnpm tsx tooling/scripts/backfill-profiles.ts
 *   OR
 *   dotenv -e packages/database/.env.local -- pnpm tsx tooling/scripts/backfill-profiles.ts
 */

import { prisma } from '@repo/database';

async function main() {
  console.log('🔍 Checking for users without profiles...');

  // Find all users without profiles
  const usersWithoutProfiles = await prisma.user.findMany({
    where: {
      profile: null
    },
    select: {
      id: true,
      email: true,
      name: true
    }
  });

  if (usersWithoutProfiles.length === 0) {
    console.log('✅ All users already have profiles!');
    return;
  }

  console.log(`📝 Found ${usersWithoutProfiles.length} users without profiles`);

  // Create profiles for users that don't have one
  let created = 0;
  let failed = 0;

  for (const user of usersWithoutProfiles) {
    try {
      await prisma.profile.create({
        data: {
          userId: user.id,
          timezone: 'UTC',
          currency: 'USD',
          settings: null
        }
      });
      created++;
      console.log(`  ✓ Created profile for ${user.email}`);
    } catch (error) {
      failed++;
      console.error(`  ✗ Failed to create profile for ${user.email}:`, error);
    }
  }

  console.log('\n📊 Summary:');
  console.log(`  Created: ${created}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${usersWithoutProfiles.length}`);

  if (failed === 0) {
    console.log('\n✅ All profiles created successfully!');
  } else {
    console.log('\n⚠️  Some profiles failed to create. Check errors above.');
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

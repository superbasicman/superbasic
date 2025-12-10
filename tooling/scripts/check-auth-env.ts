#!/usr/bin/env tsx
/**
 * Check auth-core environment variables and database connection
 */

async function checkAuthEnv() {
  console.log('🔍 Checking auth-core Environment\n');

  // Check environment variables
  console.log('📋 Environment Variables:');
  console.log(
    '  RESEND_API_KEY:',
    process.env.RESEND_API_KEY
      ? '✅ Set (' + process.env.RESEND_API_KEY.substring(0, 10) + '...)'
      : '❌ Not set'
  );
  console.log('  EMAIL_FROM:', process.env.EMAIL_FROM || '❌ Not set');
  console.log('  DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Not set');
  console.log('  AUTH_SECRET:', process.env.AUTH_SECRET ? '✅ Set' : '⚠️  Not set (used as fallback for token hashing)');
  console.log('  TOKEN_HASH_KEYS:', process.env.TOKEN_HASH_KEYS ? '✅ Set' : '⚠️  Not set (fallback uses AUTH_SECRET/TOKEN_HASH_FALLBACK_SECRET)');
  console.log('  AUTH_JWT_PRIVATE_KEY:', process.env.AUTH_JWT_PRIVATE_KEY ? '✅ Set' : '❌ Not set');
  console.log('  AUTH_JWT_KEY_ID:', process.env.AUTH_JWT_KEY_ID || '⚠️  Not set (defaults to dev-access-key)');
  console.log('  AUTH_JWT_ISSUER:', process.env.AUTH_JWT_ISSUER || process.env.AUTH_URL || '⚠️  Not set (defaults to AUTH_URL/http://localhost:3000)');
  console.log('  AUTH_JWT_AUDIENCE:', process.env.AUTH_JWT_AUDIENCE || '⚠️  Not set (defaults to <issuer>/v1)');
  console.log('');

  // Test database connection
  console.log('🗄️  Testing Database Connection:');
  try {
    const { prisma } = await import('@repo/database');
    await prisma.$queryRaw`SELECT 1 as test`;
    console.log('  ✅ Database connection successful');

    // Check if verification_tokens table exists
    const tables = (await prisma.$queryRaw`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename = 'verification_tokens'
    `) as any[];

    if (tables.length > 0) {
      console.log('  ✅ verification_tokens table exists');
    } else {
      console.log('  ❌ verification_tokens table NOT found');
    }

    await prisma.$disconnect();
  } catch (error) {
    console.log('  ❌ Database connection failed:', error);
  }
  console.log('');

  // Test Resend API
  console.log('📧 Testing Resend API:');
  if (process.env.RESEND_API_KEY) {
    try {
      // Try to get API key info (this will fail with 401 if key is invalid)
      const response = await fetch('https://api.resend.com/api-keys', {
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
      });

      if (response.ok) {
        console.log('  ✅ Resend API key valid');
      } else if (response.status === 401) {
        console.log('  ⚠️  Resend API key might be invalid (401 Unauthorized)');
        console.log('     Note: Send-only keys return 401 for API key listing');
        console.log('     This is expected if you have a send-only key');
      } else {
        console.log('  ❌ Resend API returned:', response.status, response.statusText);
      }
    } catch (error) {
      console.log('  ❌ Resend test failed:', error);
    }
  } else {
    console.log('  ⏭️  Skipped (RESEND_API_KEY not set)');
  }
  console.log('');

  console.log('💡 Recommendations:');
  if (!process.env.RESEND_API_KEY) {
    console.log('  - Set RESEND_API_KEY in apps/api/.env.local');
  }
  if (!process.env.EMAIL_FROM) {
    console.log('  - Set EMAIL_FROM in apps/api/.env.local');
  }
  if (!process.env.DATABASE_URL) {
    console.log('  - Set DATABASE_URL in apps/api/.env.local');
  }
  if (!process.env.AUTH_JWT_PRIVATE_KEY) {
    console.log('  - Set AUTH_JWT_PRIVATE_KEY (or AUTH_JWT_PRIVATE_KEY_FILE) in apps/api/.env.local');
  }
  if (!process.env.TOKEN_HASH_KEYS && !process.env.TOKEN_HASH_FALLBACK_SECRET && !process.env.AUTH_SECRET) {
    console.log('  - Set TOKEN_HASH_KEYS (or TOKEN_HASH_FALLBACK_SECRET / AUTH_SECRET) for token hashing');
  }
  console.log('');
}

checkAuthEnv().catch((error) => {
  console.error('❌ Check failed:', error);
  process.exit(1);
});

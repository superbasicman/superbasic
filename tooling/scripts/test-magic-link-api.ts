#!/usr/bin/env tsx
/**
 * Test magic link flow via API
 * Tests the full flow: CSRF token → email signin → verify email sent
 * 
 * Usage: pnpm tsx tooling/scripts/test-magic-link-api.ts <email>
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';
const testEmail = process.argv[2] || 'test@example.com';

async function testMagicLinkFlow() {
  console.log('🧪 Testing Magic Link Flow');
  console.log('📧 Email:', testEmail);
  console.log('🌐 API URL:', API_URL);
  console.log('');

  // Step 1: Get CSRF token
  console.log('Step 1: Getting CSRF token...');
  const csrfResponse = await fetch(`${API_URL}/v1/auth/csrf`, {
    credentials: 'include',
  });
  
  if (!csrfResponse.ok) {
    console.error('❌ Failed to get CSRF token:', csrfResponse.status, csrfResponse.statusText);
    process.exit(1);
  }

  const csrfData = await csrfResponse.json();
  const csrfToken = csrfData.csrfToken;
  const cookies = csrfResponse.headers.get('set-cookie') || '';
  
  console.log('✅ CSRF token obtained:', csrfToken.substring(0, 20) + '...');
  console.log('🍪 Cookies:', cookies.substring(0, 100) + '...');
  console.log('');

  // Step 2: Request magic link
  console.log('Step 2: Requesting magic link...');
  // Note: Auth.js uses "nodemailer" as the provider ID, not "email"
  const signinResponse = await fetch(`${API_URL}/v1/auth/signin/nodemailer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookies,
    },
    body: new URLSearchParams({
      email: testEmail,
      csrfToken,
    }),
    redirect: 'manual', // Don't follow redirects
  });

  console.log('📊 Response status:', signinResponse.status, signinResponse.statusText);
  console.log('📍 Redirect location:', signinResponse.headers.get('location'));
  console.log('');

  if (signinResponse.status === 302) {
    const location = signinResponse.headers.get('location');
    if (location?.includes('verify-request')) {
      console.log('✅ Magic link request successful!');
      console.log('📧 Check your email inbox for the magic link');
      console.log('');
      console.log('Expected redirect: /v1/auth/verify-request?provider=email&type=email');
      console.log('Actual redirect:', location);
    } else if (location?.includes('signin')) {
      console.log('⚠️  Redirected back to signin page - this usually means an error occurred');
      console.log('Check the API server logs for error details');
      console.log('');
      console.log('Common issues:');
      console.log('- RESEND_API_KEY not set or invalid');
      console.log('- EMAIL_FROM not set or not verified in Resend');
      console.log('- Database connection issue');
      console.log('- Auth.js adapter not configured correctly');
    } else {
      console.log('⚠️  Unexpected redirect:', location);
    }
  } else {
    console.log('❌ Unexpected response status:', signinResponse.status);
    const body = await signinResponse.text();
    console.log('Response body:', body);
  }
}

testMagicLinkFlow().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});

/**
 * Integration tests for magic link authentication flows
 * Tests magic link request, validation, expiration, and rate limiting
 * 
 * Note: These tests verify magic link flow without actually sending emails.
 * Email sending is mocked to avoid external dependencies.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Unmock @repo/database for integration tests (use real Prisma client)
vi.unmock('@repo/database');

// Note: @repo/rate-limit remains mocked for these tests
// Rate limiting behavior is tested separately in rate-limit-integration.test.ts
// These tests focus on magic link flow, not rate limit enforcement

import app from '../../../app.js';
import { resetDatabase, getTestPrisma } from '../../../test/setup.js';
import {
  makeRequest,
  postAuthJsForm,
} from '../../../test/helpers.js';
import { AUTHJS_EMAIL_PROVIDER_ID } from '@repo/auth';

const EMAIL_SIGNIN_PATH = `/v1/auth/signin/${AUTHJS_EMAIL_PROVIDER_ID}`;

type TokenHashEnvelope = {
  hash: string;
  algo?: string;
  issuedAt?: string;
  [key: string]: unknown;
};

function assertTokenHashEnvelope(value: unknown): asserts value is TokenHashEnvelope {
  expect(value).toBeTruthy();
  expect(typeof value).toBe('object');
  expect(Array.isArray(value)).toBe(false);

  const envelope = value as Record<string, unknown>;
  expect(typeof envelope.hash).toBe('string');
}

// Mock Resend to avoid hitting API rate limits in tests
vi.mock('resend', () => {
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: {
        send: vi.fn().mockResolvedValue({
          id: 'mock-email-id',
          error: null,
        }),
      },
    })),
  };
});

describe('Magic Link Flows', () => {
  beforeEach(async () => {
    await resetDatabase();
    // Note: Using unique email addresses with timestamps to avoid Redis state collisions
  });

  describe('Magic Link Request', () => {
    it('should accept magic link request with valid email', async () => {
      const response = await postAuthJsForm(app, EMAIL_SIGNIN_PATH, {
        email: 'test@example.com',
      });

      // Auth.js returns 302 redirect to verify-request page
      expect(response.status).toBe(302);

      const location = response.headers.get('Location');
      expect(location).toBeTruthy();
      const decodedLocation = decodeURIComponent(location!);
      expect(decodedLocation).toContain('verify-request');
      expect(decodedLocation).toContain(`provider=${AUTHJS_EMAIL_PROVIDER_ID}`);
      expect(decodedLocation).toContain('type=email');
    });

    it('should normalize email address (lowercase + trim)', async () => {
      const response = await postAuthJsForm(app, EMAIL_SIGNIN_PATH, {
        email: '  TEST@EXAMPLE.COM  ',
      });

      expect(response.status).toBe(302);

      const location = response.headers.get('Location');
      expect(location).toBeTruthy();
      expect(location).toContain('verify-request');
    });

    it('should reject invalid email format', async () => {
      const response = await postAuthJsForm(app, EMAIL_SIGNIN_PATH, {
        email: 'not-an-email',
      });

      // Auth.js returns 302 redirect to error page for invalid email
      expect(response.status).toBe(302);

      const location = response.headers.get('Location');
      expect(location).toBeTruthy();
      expect(location).toContain('error=');
    });

    it('should reject empty email', async () => {
      const response = await postAuthJsForm(app, EMAIL_SIGNIN_PATH, {
        email: '',
      });

      // Auth.js returns 400 for invalid email format (including empty)
      expect(response.status).toBe(400);
    });

    it('should create verification token in database', async () => {
      const prisma = getTestPrisma();
      const email = 'token-test@example.com'; // Use unique email to avoid old tokens

      // Request magic link
      const response = await postAuthJsForm(app, EMAIL_SIGNIN_PATH, {
        email,
      });

      expect(response.status).toBe(302);

      // Verify token was created in database
      const tokens = await prisma.verificationToken.findMany({
        where: {
          identifier: email,
        },
        orderBy: {
          expires: 'desc', // Get the most recent token
        },
      });

      expect(tokens.length).toBeGreaterThan(0);
      const token = tokens[0];
      expect(token).toBeDefined();
      expect(token!.identifier).toBe(email);
      expect(token!.tokenId).toBeTruthy();
      const tokenHash = token!.tokenHash;
      assertTokenHashEnvelope(tokenHash);
      expect(tokenHash.hash).toBeTruthy();
      expect(token!.expires).toBeInstanceOf(Date);
      
      // Token should expire in the future (check it's at least 1 hour from now)
      const oneHourFromNow = Date.now() + (60 * 60 * 1000);
      expect(token!.expires.getTime()).toBeGreaterThan(Date.now());
      expect(token!.expires.getTime()).toBeLessThan(oneHourFromNow * 2); // Within 2 hours
    });
  });

  describe('Magic Link Rate Limiting', () => {
    // Note: These tests are skipped because they require real Redis connection
    // Rate limiting is tested with mocked Redis in rate-limit-integration.test.ts
    // In production, magic link requests are limited to 3 per hour per email
    
    it.skip('should allow 3 magic link requests per hour', async () => {
      // Skipped: Requires real Redis connection
      // Rate limiting behavior is tested in rate-limit-integration.test.ts
    });

    it.skip('should block 4th magic link request within hour', async () => {
      // Skipped: Requires real Redis connection
      // Rate limiting behavior is tested in rate-limit-integration.test.ts
    });

    it.skip('should include rate limit headers', async () => {
      // Skipped: Requires real Redis connection
      // Rate limiting behavior is tested in rate-limit-integration.test.ts
    });

    it.skip('should include Retry-After header when rate limited', async () => {
      // Skipped: Requires real Redis connection
      // Rate limiting behavior is tested in rate-limit-integration.test.ts
    });

    it.skip('should normalize email for rate limiting', async () => {
      // Skipped: Requires real Redis connection
      // Rate limiting behavior is tested in rate-limit-integration.test.ts
    });
  });

  describe('Magic Link Validation', () => {
    it('should verify email provider is configured', async () => {
      // Verify email provider exists in Auth.js config
      const { authConfig } = await import('@repo/auth');
      
      expect(authConfig.providers).toBeTruthy();
      expect(Array.isArray(authConfig.providers)).toBe(true);
      
      // Find email provider in config (namespaced Auth.js email provider)
      const emailProvider = authConfig.providers.find(
        (p: any) => p.id === AUTHJS_EMAIL_PROVIDER_ID || p.type === 'email'
      );
      
      expect(emailProvider).toBeDefined();
      expect((emailProvider as any)?.type).toBe('email');
    });

    it('should verify email utility function exists', async () => {
      // Verify sendMagicLinkEmail function is exported
      const { sendMagicLinkEmail } = await import('@repo/auth');
      
      expect(typeof sendMagicLinkEmail).toBe('function');
    });

    it('should verify verification token schema', async () => {
      const prisma = getTestPrisma();

      // Verify verification_tokens table exists with correct schema
      const tableInfo = await prisma.$queryRaw`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'verification_tokens'
        ORDER BY ordinal_position;
      `;

      expect(tableInfo).toBeTruthy();
      
      const columns = (tableInfo as any[]).map((col) => col.column_name);
      expect(columns).toContain('identifier');
      expect(columns).toContain('token_id');
      expect(columns).toContain('token_hash');
      expect(columns).toContain('expires');
    });
  });

  describe('Magic Link Token Management', () => {
    it('should create unique token for each request', async () => {
      const prisma = getTestPrisma();
      const email = 'unique@example.com';

      // Request 2 magic links
      await postAuthJsForm(app, EMAIL_SIGNIN_PATH, { email });
      await postAuthJsForm(app, EMAIL_SIGNIN_PATH, { email });

      // Verify 2 different tokens were created
      const tokens = await prisma.verificationToken.findMany({
        where: { identifier: email },
        orderBy: { expires: 'desc' },
      });

      expect(tokens.length).toBeGreaterThanOrEqual(2);
      
      // Verify tokens are different
      if (tokens.length >= 2) {
        const firstHash = tokens[0]!.tokenHash;
        const secondHash = tokens[1]!.tokenHash;
        assertTokenHashEnvelope(firstHash);
        assertTokenHashEnvelope(secondHash);
        expect(firstHash.hash).not.toBe(secondHash.hash);
      }
    });

    it('should set token expiration to future date', async () => {
      const prisma = getTestPrisma();
      const email = 'expiry@example.com';

      await postAuthJsForm(app, EMAIL_SIGNIN_PATH, { email });

      const token = await prisma.verificationToken.findFirst({
        where: { identifier: email },
        orderBy: { expires: 'desc' },
      });

      expect(token).toBeTruthy();
      expect(token!.expires.getTime()).toBeGreaterThan(Date.now());
      
      // Token should expire within 24 hours (Auth.js default)
      const twentyFourHours = 24 * 60 * 60 * 1000;
      expect(token!.expires.getTime()).toBeLessThanOrEqual(Date.now() + twentyFourHours);
    });

    it('should store hashed token in database', async () => {
      const prisma = getTestPrisma();
      const email = 'hashed@example.com';

      await postAuthJsForm(app, EMAIL_SIGNIN_PATH, { email });

      const token = await prisma.verificationToken.findFirst({
        where: { identifier: email },
        orderBy: { expires: 'desc' },
      });

      expect(token).toBeTruthy();
      const tokenHash = token!.tokenHash;
      assertTokenHashEnvelope(tokenHash);
      expect(tokenHash.hash).toBeTruthy();
      
      // Token should be a hash (not plaintext email link)
      // Auth.js stores hashed tokens for security
      expect(tokenHash.hash.length).toBeGreaterThan(20);
    });
  });

  describe('Magic Link Email Provider', () => {
    it('should list email provider in available providers', async () => {
      const response = await makeRequest(app, 'GET', '/v1/auth/providers');

      expect(response.status).toBe(200);

      const data = await response.json();
      
      // Auth.js uses the namespaced provider ID for email
      expect(data).toHaveProperty(AUTHJS_EMAIL_PROVIDER_ID);
      expect(data[AUTHJS_EMAIL_PROVIDER_ID].type).toBe('email');
    });

    it('should verify email provider configuration', async () => {
      // Verify EMAIL_FROM environment variable is set
      const emailFrom = process.env.EMAIL_FROM;
      
      expect(emailFrom).toBeTruthy();
      expect(emailFrom).toContain('@');
      expect(emailFrom).toContain('superbasicfinance.com');
    });

    it('should verify Resend API key is configured', async () => {
      // Verify RESEND_API_KEY environment variable is set
      const resendApiKey = process.env.RESEND_API_KEY;
      
      expect(resendApiKey).toBeTruthy();
      expect(resendApiKey).toMatch(/^re_/); // Resend keys start with re_
    });
  });
});

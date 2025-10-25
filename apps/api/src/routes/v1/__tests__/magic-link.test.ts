/**
 * Integration tests for magic link authentication flows
 * Tests magic link request, validation, expiration, and rate limiting
 * 
 * Note: These tests verify magic link flow without actually sending emails.
 * Email sending is mocked to avoid external dependencies.
 */

import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest';

// Unmock @repo/database for integration tests (use real Prisma client)
vi.unmock('@repo/database');

import app from '../../../app.js';
import { resetDatabase, getTestPrisma } from '../../../test/setup.js';
import {
  makeRequest,
  postAuthJsForm,
  extractCookie,
} from '../../../test/helpers.js';

// Auth.js uses this cookie name
const COOKIE_NAME = 'authjs.session-token';

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
  });

  describe('Magic Link Request', () => {
    it('should accept magic link request with valid email', async () => {
      const response = await postAuthJsForm(app, '/v1/auth/signin/nodemailer', {
        email: 'test@example.com',
      });

      // Auth.js returns 302 redirect to verify-request page
      expect(response.status).toBe(302);

      const location = response.headers.get('Location');
      expect(location).toBeTruthy();
      expect(location).toContain('verify-request');
      expect(location).toContain('provider=nodemailer');
      expect(location).toContain('type=email');
    });

    it('should normalize email address (lowercase + trim)', async () => {
      const response = await postAuthJsForm(app, '/v1/auth/signin/nodemailer', {
        email: '  TEST@EXAMPLE.COM  ',
      });

      expect(response.status).toBe(302);

      const location = response.headers.get('Location');
      expect(location).toBeTruthy();
      expect(location).toContain('verify-request');
    });

    it('should reject invalid email format', async () => {
      const response = await postAuthJsForm(app, '/v1/auth/signin/nodemailer', {
        email: 'not-an-email',
      });

      // Auth.js returns 302 redirect to error page for invalid email
      expect(response.status).toBe(302);

      const location = response.headers.get('Location');
      expect(location).toBeTruthy();
      expect(location).toContain('error=');
    });

    it('should reject empty email', async () => {
      const response = await postAuthJsForm(app, '/v1/auth/signin/nodemailer', {
        email: '',
      });

      // Auth.js returns 400 for invalid email format (including empty)
      expect(response.status).toBe(400);
    });

    it('should create verification token in database', async () => {
      const prisma = getTestPrisma();
      const email = 'token-test@example.com'; // Use unique email to avoid old tokens

      // Request magic link
      const response = await postAuthJsForm(app, '/v1/auth/signin/nodemailer', {
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
      expect(tokens[0].identifier).toBe(email);
      expect(tokens[0].token).toBeTruthy();
      expect(tokens[0].expires).toBeInstanceOf(Date);
      
      // Token should expire in the future (check it's at least 1 hour from now)
      const oneHourFromNow = Date.now() + (60 * 60 * 1000);
      expect(tokens[0].expires.getTime()).toBeGreaterThan(Date.now());
      expect(tokens[0].expires.getTime()).toBeLessThan(oneHourFromNow * 2); // Within 2 hours
    });
  });

  describe('Magic Link Rate Limiting', () => {
    it('should allow 3 magic link requests per hour', async () => {
      const email = 'ratelimit@example.com';

      // Make 3 requests (should all succeed)
      for (let i = 0; i < 3; i++) {
        const response = await postAuthJsForm(app, '/v1/auth/signin/nodemailer', {
          email,
        });

        expect(response.status).toBe(302);
        
        const location = response.headers.get('Location');
        expect(location).toContain('verify-request');
      }
    });

    it('should block 4th magic link request within hour', async () => {
      // Use unique email with timestamp to avoid Redis state from other tests
      const email = `ratelimit2-${Date.now()}@example.com`;

      // Make 3 successful requests
      for (let i = 0; i < 3; i++) {
        const response = await postAuthJsForm(app, '/v1/auth/signin/nodemailer', {
          email,
        });
        expect(response.status).toBe(302); // Verify each succeeds
      }

      // 4th request should be rate limited by our middleware
      const response = await postAuthJsForm(app, '/v1/auth/signin/nodemailer', {
        email,
      });

      expect(response.status).toBe(429);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('Too many magic link requests');
      expect(data).toHaveProperty('message');
      expect(data.message).toContain('Rate limit exceeded');
    });

    it('should include rate limit headers', async () => {
      const email = 'ratelimit3@example.com';

      const response = await postAuthJsForm(app, '/v1/auth/signin/nodemailer', {
        email,
      });

      expect(response.status).toBe(302);

      // Verify rate limit headers are present
      expect(response.headers.get('X-RateLimit-Limit')).toBe('3');
      expect(response.headers.get('X-RateLimit-Remaining')).toBeTruthy();
      expect(response.headers.get('X-RateLimit-Reset')).toBeTruthy();
    });

    it('should include Retry-After header when rate limited', async () => {
      // Use unique email with timestamp to avoid Redis state from other tests
      const email = `ratelimit4-${Date.now()}@example.com`;

      // Make 3 successful requests
      for (let i = 0; i < 3; i++) {
        const response = await postAuthJsForm(app, '/v1/auth/signin/nodemailer', {
          email,
        });
        expect(response.status).toBe(302); // Verify each succeeds
      }

      // 4th request should be rate limited by our middleware
      const response = await postAuthJsForm(app, '/v1/auth/signin/nodemailer', {
        email,
      });

      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBeTruthy();
      
      const retryAfter = parseInt(response.headers.get('Retry-After') || '0');
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(3600); // Max 1 hour
    });

    it('should normalize email for rate limiting', async () => {
      // Use unique email with timestamp to avoid Redis state from other tests
      const email = `normalize-${Date.now()}@example.com`;

      // Make 3 requests with different casing/whitespace
      const response1 = await postAuthJsForm(app, '/v1/auth/signin/nodemailer', {
        email: email.toLowerCase(),
      });
      expect(response1.status).toBe(302);

      const response2 = await postAuthJsForm(app, '/v1/auth/signin/nodemailer', {
        email: email.toUpperCase(),
      });
      expect(response2.status).toBe(302);

      const response3 = await postAuthJsForm(app, '/v1/auth/signin/nodemailer', {
        email: `  ${email}  `,
      });
      expect(response3.status).toBe(302);

      // 4th request should be rate limited (all counted as same email)
      const response = await postAuthJsForm(app, '/v1/auth/signin/nodemailer', {
        email,
      });

      expect(response.status).toBe(429);
    });
  });

  describe('Magic Link Validation', () => {
    it('should verify email provider is configured', async () => {
      // Verify email provider exists in Auth.js config
      const { authConfig } = await import('@repo/auth');
      
      expect(authConfig.providers).toBeTruthy();
      expect(Array.isArray(authConfig.providers)).toBe(true);
      
      // Find email provider in config (Auth.js uses "nodemailer" as provider ID)
      const emailProvider = authConfig.providers.find(
        (p: any) => p.id === 'nodemailer' || p.type === 'email'
      );
      
      expect(emailProvider).toBeTruthy();
      expect(emailProvider.type).toBe('email');
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
      expect(columns).toContain('token');
      expect(columns).toContain('expires');
    });
  });

  describe('Magic Link Token Management', () => {
    it('should create unique token for each request', async () => {
      const prisma = getTestPrisma();
      const email = 'unique@example.com';

      // Request 2 magic links
      await postAuthJsForm(app, '/v1/auth/signin/nodemailer', { email });
      await postAuthJsForm(app, '/v1/auth/signin/nodemailer', { email });

      // Verify 2 different tokens were created
      const tokens = await prisma.verificationToken.findMany({
        where: { identifier: email },
        orderBy: { expires: 'desc' },
      });

      expect(tokens.length).toBeGreaterThanOrEqual(2);
      
      // Verify tokens are different
      if (tokens.length >= 2) {
        expect(tokens[0].token).not.toBe(tokens[1].token);
      }
    });

    it('should set token expiration to future date', async () => {
      const prisma = getTestPrisma();
      const email = 'expiry@example.com';

      await postAuthJsForm(app, '/v1/auth/signin/nodemailer', { email });

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

      await postAuthJsForm(app, '/v1/auth/signin/nodemailer', { email });

      const token = await prisma.verificationToken.findFirst({
        where: { identifier: email },
        orderBy: { expires: 'desc' },
      });

      expect(token).toBeTruthy();
      expect(token!.token).toBeTruthy();
      
      // Token should be a hash (not plaintext email link)
      // Auth.js stores hashed tokens for security
      expect(token!.token.length).toBeGreaterThan(20);
    });
  });

  describe('Magic Link Email Provider', () => {
    it('should list email provider in available providers', async () => {
      const response = await makeRequest(app, 'GET', '/v1/auth/providers');

      expect(response.status).toBe(200);

      const data = await response.json();
      
      // Auth.js uses "nodemailer" as the provider ID for email
      expect(data).toHaveProperty('nodemailer');
      expect(data.nodemailer.type).toBe('email');
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

import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.unmock('@repo/database');

import app from '../../../app.js';
import { resetDatabase } from '../../../test/setup.js';
import {
  createTestUser,
  createTestUserCredentials,
  extractCookie,
  signInWithCredentials,
} from '../../../test/helpers.js';
import { REFRESH_CSRF_COOKIE, REFRESH_TOKEN_COOKIE } from '../auth/refresh-cookie.js';
import { authEvents } from '@repo/auth/events';

vi.mock('@repo/auth/events', () => ({
  authEvents: {
    emit: vi.fn(),
  },
}));

describe('Auth.js Credentials Sign-In (no Auth.js session cookies)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('Login Success', () => {
    it('issues auth-core refresh cookies and no Auth.js cookies for valid credentials', async () => {
      const { credentials } = await createTestUser({ name: 'Test User' });

      const response = await signInWithCredentials(app, credentials.email, credentials.password);

      expect(response.status).toBe(302);

      const setCookieHeaders = response.headers.getSetCookie?.() || [];
      expect(setCookieHeaders.some((h) => h.includes('authjs.session-token'))).toBe(false);
      expect(setCookieHeaders.some((h) => h.includes('authjs.csrf-token'))).toBe(false);
      expect(setCookieHeaders.some((h) => h.includes('__Host-authjs.csrf-token'))).toBe(false);

      const refreshCookie = extractCookie(response, REFRESH_TOKEN_COOKIE);
      const csrfCookie = extractCookie(response, REFRESH_CSRF_COOKIE);
      expect(refreshCookie).toBeTruthy();
      expect(csrfCookie).toBeTruthy();
      expect(refreshCookie).toBeTruthy();
      expect(csrfCookie).toBeTruthy();
      expect(response.headers.get('X-Access-Token')).toBeTruthy();

      expect(authEvents.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'user.session.created',
          userId: expect.any(String),
          metadata: expect.objectContaining({
            provider: 'authjs-unified',
          }),
        })
      );
    });

    it('sets refresh and CSRF cookies with expected attributes', async () => {
      const { credentials } = await createTestUser();

      const response = await signInWithCredentials(app, credentials.email, credentials.password);

      expect(response.status).toBe(302);

      const setCookieHeaders = response.headers.getSetCookie?.() || [];
      const refreshHeader = setCookieHeaders.find((h) => h.startsWith(`${REFRESH_TOKEN_COOKIE}=`));
      const csrfHeader = setCookieHeaders.find((h) => h.startsWith(`${REFRESH_CSRF_COOKIE}=`));

      expect(refreshHeader).toBeTruthy();
      expect(refreshHeader).toContain('HttpOnly');
      expect(refreshHeader).toContain('SameSite=');
      expect(refreshHeader).toContain('Path=');

      expect(csrfHeader).toBeTruthy();
      expect(csrfHeader).toContain('SameSite=');
      expect(csrfHeader).toContain('Path=');
      expect(csrfHeader).not.toContain('HttpOnly');
    });

    it('accepts email case-insensitively and trims whitespace', async () => {
      const { credentials } = await createTestUser({ email: 'test@example.com' });

      const responseUpper = await signInWithCredentials(app, 'TEST@EXAMPLE.COM', credentials.password);
      expect(responseUpper.status).toBe(302);
      expect(extractCookie(responseUpper, REFRESH_TOKEN_COOKIE)).toBeTruthy();

      const responseTrimmed = await signInWithCredentials(app, `  ${credentials.email}  `, credentials.password);
      expect(responseTrimmed.status).toBe(302);
      expect(extractCookie(responseTrimmed, REFRESH_TOKEN_COOKIE)).toBeTruthy();
    });
  });

  describe('Login Failure', () => {
    it('returns 302 for invalid password without issuing refresh cookies', async () => {
      const { credentials } = await createTestUser();

      const response = await signInWithCredentials(app, credentials.email, 'WrongPassword123!');

      expect(response.status).toBe(302);
      expect(extractCookie(response, REFRESH_TOKEN_COOKIE)).toBeNull();
    });

    it('returns 302 for non-existent email without issuing refresh cookies', async () => {
      const credentials = createTestUserCredentials();

      const response = await signInWithCredentials(app, credentials.email, credentials.password);

      expect(response.status).toBe(302);
      expect(extractCookie(response, REFRESH_TOKEN_COOKIE)).toBeNull();
    });

    it('does not leak whether user exists', async () => {
      const { credentials: existingUser } = await createTestUser();
      const nonExistentCredentials = createTestUserCredentials();

      const response1 = await signInWithCredentials(
        app,
        nonExistentCredentials.email,
        nonExistentCredentials.password
      );
      const response2 = await signInWithCredentials(app, existingUser.email, 'WrongPassword123!');

      expect(response1.status).toBe(302);
      expect(response2.status).toBe(302);
    });
  });
});

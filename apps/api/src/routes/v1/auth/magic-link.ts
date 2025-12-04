import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { setCookie } from 'hono/cookie';
import { prisma } from '@repo/database';
import {
  sendMagicLinkEmail,
  createOpaqueToken,
  createTokenHashEnvelope,
  COOKIE_NAME,
} from '@repo/auth';
import { authService } from '../../../lib/auth-service.js';
import { setRefreshTokenCookie } from './refresh-cookie.js';
import { randomBytes } from 'node:crypto';
import { upsertMagicLinkIdentity } from '../../../lib/identity-provider.js';

const magicLink = new Hono();

const WEB_APP_URL = process.env.WEB_APP_URL || 'http://localhost:5173';
const API_URL = process.env.AUTH_URL || 'http://localhost:3000';

/**
 * POST /v1/auth/magic-link/send
 * Sends a magic link email to the user
 */
magicLink.post(
  '/send',
  zValidator(
    'json',
    z.object({
      email: z.string().email(),
    })
  ),
  async (c) => {
    const { email } = c.req.valid('json');
    const normalizedEmail = email.toLowerCase().trim();

    // Create a verification token
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createTokenHashEnvelope(token);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Find or note the user (don't reveal if user exists)
    const user = await prisma.user.findFirst({
      where: {
        primaryEmail: normalizedEmail,
        deletedAt: null,
      },
    });

    // Create a unique token ID for lookup
    const tokenId = randomBytes(16).toString('base64url');

    // Store the verification token
    await prisma.verificationToken.create({
      data: {
        identifier: normalizedEmail,
        tokenId,
        hashEnvelope: tokenHash,
        type: 'magic_link',
        expiresAt,
      },
    });

    // Build magic link URL
    const magicLinkUrl = `${API_URL}/v1/auth/magic-link/verify?token=${encodeURIComponent(token)}&email=${encodeURIComponent(normalizedEmail)}`;

    // Send email (only if user exists, but always return success for security)
    if (user) {
      try {
        await sendMagicLinkEmail({
          to: normalizedEmail,
          url: magicLinkUrl,
        });
      } catch (error) {
        console.error('Failed to send magic link email:', error);
        // Don't reveal error to prevent email enumeration
      }
    }

    // Always return success to prevent email enumeration
    return c.json({
      success: true,
      message: 'If an account exists for this email, a magic link has been sent.',
    });
  }
);

/**
 * GET /v1/auth/magic-link/verify
 * Verifies the magic link token and logs the user in
 */
magicLink.get(
  '/verify',
  zValidator(
    'query',
    z.object({
      token: z.string(),
      email: z.string().email(),
    })
  ),
  async (c) => {
    const { token, email } = c.req.valid('query');
    const normalizedEmail = email.toLowerCase().trim();

    // Find the verification token
    const verificationToken = await prisma.verificationToken.findFirst({
      where: {
        identifier: normalizedEmail,
        type: 'magic_link',
        expiresAt: { gt: new Date() },
        consumedAt: null,
      },
      orderBy: {
        expiresAt: 'desc',
      },
    });

    if (!verificationToken) {
      const errorUrl = new URL('/login', WEB_APP_URL);
      errorUrl.searchParams.set('error', 'invalid_token');
      errorUrl.searchParams.set('error_description', 'Magic link has expired or is invalid');
      return c.redirect(errorUrl.toString());
    }

    // Verify the token
    const { verifyTokenSecret } = await import('@repo/auth');
    const isValid = await verifyTokenSecret(token, verificationToken.hashEnvelope as any);
    if (!isValid) {
      const errorUrl = new URL('/login', WEB_APP_URL);
      errorUrl.searchParams.set('error', 'invalid_token');
      errorUrl.searchParams.set('error_description', 'Magic link is invalid');
      return c.redirect(errorUrl.toString());
    }

    // Mark the token as consumed (don't delete, keep for audit)
    await prisma.verificationToken.update({
      where: { id: verificationToken.id },
      data: { consumedAt: new Date() },
    });

    const { userId, identity } = await upsertMagicLinkIdentity(normalizedEmail);

    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || null;
    const userAgent = c.req.header('user-agent') || null;

    // Create session
    const { session, refresh } = await authService.createSessionWithRefresh({
      userId,
      clientType: 'web',
      ipAddress,
      userAgent,
      rememberMe: true,
      identity,
    });

    // Set session cookie
    setCookie(c, COOKIE_NAME, session.sessionId, {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60, // 30 days
      sameSite: 'Lax',
    });

    setRefreshTokenCookie(c, refresh.refreshToken, refresh.token.expiresAt);

    // Generate authorization code for frontend callback
    const opaque = createOpaqueToken();
    const codeHash = createTokenHashEnvelope(opaque.tokenSecret);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.oAuthAuthorizationCode.create({
      data: {
        id: opaque.tokenId,
        userId,
        clientId: 'web-dashboard',
        redirectUri: `${WEB_APP_URL}/auth/callback`,
        codeHash,
        codeChallenge: '', // No PKCE for magic link flow
        codeChallengeMethod: 'S256',
        scopes: ['openid', 'profile', 'email'],
        expiresAt,
      },
    });

    // Redirect to frontend callback with authorization code
    const callbackUrl = new URL('/auth/callback', WEB_APP_URL);
    callbackUrl.searchParams.set('code', opaque.value);
    callbackUrl.searchParams.set('state', 'magic-link');

    return c.redirect(callbackUrl.toString());
  }
);

export { magicLink };

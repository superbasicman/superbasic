import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { setCookie, getCookie } from 'hono/cookie';
import { prisma } from '@repo/database';
import { GOOGLE_PROVIDER_ID, COOKIE_NAME } from '@repo/auth';
import { authService } from '../../../lib/auth-service.js';
import { setRefreshTokenCookie } from './refresh-cookie.js';
import { createOpaqueToken, createTokenHashEnvelope } from '@repo/auth';
import { randomBytes } from 'node:crypto';

const google = new Hono();

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

const WEB_APP_URL = process.env.WEB_APP_URL || 'http://localhost:5173';
const API_URL = process.env.AUTH_URL || 'http://localhost:3000';

/**
 * GET /v1/auth/google
 * Initiates Google OAuth flow by redirecting to Google's authorization endpoint.
 * Stores OAuth state and PKCE verifier for the return flow.
 */
google.get(
  '/',
  zValidator(
    'query',
    z.object({
      returnTo: z.string().optional(),
    })
  ),
  async (c) => {
    const { returnTo } = c.req.valid('query');

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return c.json({ error: 'Google OAuth not configured' }, 500);
    }

    // Generate state for CSRF protection
    const state = randomBytes(32).toString('base64url');

    // Store state and returnTo in cookie (will be validated on callback)
    setCookie(c, 'google_oauth_state', state, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 600, // 10 minutes
      sameSite: 'Lax',
    });

    if (returnTo) {
      setCookie(c, 'google_oauth_return_to', returnTo, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 600,
        sameSite: 'Lax',
      });
    }

    // Build Google authorization URL
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${API_URL}/v1/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      // Force account selection
      prompt: 'select_account',
      // Access type for refresh tokens (offline) - not needed for sign-in only
      access_type: 'online',
    });

    return c.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
  }
);

/**
 * GET /v1/auth/google/callback
 * Handles Google OAuth callback, exchanges code for tokens,
 * creates/updates user, and redirects to frontend.
 */
google.get(
  '/callback',
  zValidator(
    'query',
    z.object({
      code: z.string().optional(),
      state: z.string().optional(),
      error: z.string().optional(),
      error_description: z.string().optional(),
    })
  ),
  async (c) => {
    const { code, state, error, error_description } = c.req.valid('query');

    // Handle OAuth errors from Google
    if (error) {
      const errorUrl = new URL('/login', WEB_APP_URL);
      errorUrl.searchParams.set('error', error);
      errorUrl.searchParams.set('error_description', error_description || 'Google sign-in failed');
      return c.redirect(errorUrl.toString());
    }

    // Validate state
    const storedState = getCookie(c, 'google_oauth_state');
    if (!state || state !== storedState) {
      const errorUrl = new URL('/login', WEB_APP_URL);
      errorUrl.searchParams.set('error', 'invalid_state');
      errorUrl.searchParams.set('error_description', 'Invalid OAuth state');
      return c.redirect(errorUrl.toString());
    }

    if (!code) {
      const errorUrl = new URL('/login', WEB_APP_URL);
      errorUrl.searchParams.set('error', 'missing_code');
      errorUrl.searchParams.set('error_description', 'Authorization code missing');
      return c.redirect(errorUrl.toString());
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      const errorUrl = new URL('/login', WEB_APP_URL);
      errorUrl.searchParams.set('error', 'server_error');
      errorUrl.searchParams.set('error_description', 'Google OAuth not configured');
      return c.redirect(errorUrl.toString());
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: `${API_URL}/v1/auth/google/callback`,
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({}));
        console.error('Google token exchange failed:', errorData);
        throw new Error('Failed to exchange authorization code');
      }

      const tokenData = await tokenResponse.json();

      // Get user info from Google
      const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      if (!userInfoResponse.ok) {
        throw new Error('Failed to get user info from Google');
      }

      const googleUser = await userInfoResponse.json();

      // Normalize to VerifiedIdentity
      const verifiedIdentity = {
        provider: GOOGLE_PROVIDER_ID,
        providerUserId: googleUser.sub,
        email: googleUser.email,
        emailVerified: googleUser.email_verified || false,
        name: googleUser.name,
        picture: googleUser.picture,
      };

      // Find or create user
      let user = await findOrCreateUserFromGoogle(verifiedIdentity);

      const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || null;
      const userAgent = c.req.header('user-agent') || null;

      // Create session
      const { session, refresh } = await authService.createSessionWithRefresh({
        userId: user.id,
        clientType: 'web',
        ipAddress,
        userAgent,
        rememberMe: true,
        identity: {
          provider: GOOGLE_PROVIDER_ID,
          providerUserId: googleUser.sub,
          email: googleUser.email,
          emailVerified: googleUser.email_verified || false,
        },
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

      // Clear OAuth state cookies
      setCookie(c, 'google_oauth_state', '', { path: '/', maxAge: 0 });
      setCookie(c, 'google_oauth_return_to', '', { path: '/', maxAge: 0 });

      // Check if there's a pending OAuth authorization flow to return to
      const returnTo = getCookie(c, 'google_oauth_return_to');
      if (returnTo && returnTo.includes('/v1/oauth/authorize')) {
        return c.redirect(returnTo);
      }

      // Generate authorization code for our OAuth flow
      const opaque = createOpaqueToken();
      const codeHash = createTokenHashEnvelope(opaque.tokenSecret);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await prisma.oAuthAuthorizationCode.create({
        data: {
          id: opaque.tokenId,
          userId: user.id,
          clientId: 'web-dashboard',
          redirectUri: `${WEB_APP_URL}/auth/callback`,
          codeHash,
          codeChallenge: '', // Not using PKCE for this redirect flow
          codeChallengeMethod: 'S256',
          scopes: ['openid', 'profile', 'email'],
          expiresAt,
        },
      });

      // Redirect to frontend callback with our authorization code
      const callbackUrl = new URL('/auth/callback', WEB_APP_URL);
      callbackUrl.searchParams.set('code', opaque.value);
      callbackUrl.searchParams.set('state', 'google-oauth'); // Special state for Google flow

      return c.redirect(callbackUrl.toString());
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      const errorUrl = new URL('/login', WEB_APP_URL);
      errorUrl.searchParams.set('error', 'server_error');
      errorUrl.searchParams.set(
        'error_description',
        error instanceof Error ? error.message : 'Failed to complete Google sign-in'
      );
      return c.redirect(errorUrl.toString());
    }
  }
);

/**
 * Find or create a user from Google OAuth identity
 */
async function findOrCreateUserFromGoogle(identity: {
  provider: string;
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}) {
  // First, try to find by identity
  const existingIdentity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerSubject: {
        provider: 'google',
        providerSubject: identity.providerUserId,
      },
    },
    include: {
      user: true,
    },
  });

  if (existingIdentity) {
    return existingIdentity.user;
  }

  // Try to find user by email
  const existingUser = await prisma.user.findFirst({
    where: {
      primaryEmail: identity.email.toLowerCase(),
      deletedAt: null,
    },
  });

  if (existingUser) {
    // Link Google identity to existing user
    await prisma.userIdentity.create({
      data: {
        userId: existingUser.id,
        provider: 'google',
        providerSubject: identity.providerUserId,
        emailAtProvider: identity.email,
        emailVerifiedAtProvider: identity.emailVerified,
        rawProfile: {
          name: identity.name,
          picture: identity.picture,
        },
      },
    });
    return existingUser;
  }

  // Create new user with Google identity
  const newUser = await prisma.user.create({
    data: {
      primaryEmail: identity.email.toLowerCase(),
      displayName: identity.name || null,
      emailVerified: identity.emailVerified,
      userState: 'active',
      identities: {
        create: {
          provider: 'google',
          providerSubject: identity.providerUserId,
          emailAtProvider: identity.email,
          emailVerifiedAtProvider: identity.emailVerified,
          rawProfile: {
            name: identity.name,
            picture: identity.picture,
          },
        },
      },
      profile: {
        create: {
          timezone: 'UTC',
          currency: 'USD',
        },
      },
    },
  });

  return newUser;
}

export { google };

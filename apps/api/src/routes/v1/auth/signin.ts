import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { setCookie } from 'hono/cookie';
import { COOKIE_NAME, generateSessionTransferToken } from '@repo/auth';
import { authService } from '../../../lib/auth-service.js';
import { setRefreshTokenCookie } from './refresh-cookie.js';
import { authenticatePasswordIdentity } from '../../../lib/identity-provider.js';
import {
    checkFailedAuthRateLimit,
    trackFailedAuth,
} from '../../../middleware/rate-limit/failed-auth-tracking.js';
import { generateCsrfToken, setCsrfCookie } from '../../../middleware/csrf.js';
import { sessionTransferTokenRepository } from '../../../services/index.js';

const signin = new Hono();

// --- Password ---

const passwordSchema = z.object({
    email: z.string().email(),
    password: z.string(),
    // Optional: request a session transfer token for mobile OAuth flow
    session_transfer: z.boolean().optional().default(false),
});

signin.post('/password', zValidator('json', passwordSchema), async (c) => {
    const { email, password, session_transfer } = c.req.valid('json');
    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';

    const isRateLimited = await checkFailedAuthRateLimit(ipAddress, email);
    if (isRateLimited) {
        return c.json({ error: 'Too many failed attempts. Please try again later.' }, 429);
    }

    const authResult = await authenticatePasswordIdentity(email, password);
    if (!authResult) {
        await trackFailedAuth(ipAddress, email);
        return c.json({ error: 'Invalid credentials' }, 401);
    }

    const userAgent = c.req.header('user-agent') || null;

    const { session, refresh } = await authService.createSessionWithRefresh({
        userId: authResult.userId,
        clientType: 'web',
        ipAddress,
        userAgent,
        rememberMe: true,
        identity: authResult.identity,
    });

    // Set session cookie so OAuth authorize can find the session
    setCookie(c, COOKIE_NAME, session.sessionId, {
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60, // 30 days
        sameSite: 'Lax',
    });

    setRefreshTokenCookie(c, refresh.refreshToken, refresh.token.expiresAt);

    // Set CSRF token for browser-based flows
    const csrfToken = generateCsrfToken();
    setCsrfCookie(c, csrfToken);

    const { token: accessToken } = await authService.issueAccessToken({
        userId: authResult.userId,
        sessionId: session.sessionId,
        clientType: session.clientType,
        mfaLevel: session.mfaLevel,
    });

    let sessionTransferToken: string | undefined;

    if (session_transfer) {
        // Generate session transfer token for mobile OAuth flow
        // Mobile apps can't share cookies with the system browser, so they use this
        // opaque token to transfer the authenticated session to /v1/oauth/authorize
        const sessionTransfer = generateSessionTransferToken();
        await sessionTransferTokenRepository.create({
            id: sessionTransfer.tokenId,
            sessionId: session.sessionId,
            hashEnvelope: sessionTransfer.hashEnvelope,
            expiresAt: sessionTransfer.expiresAt,
            createdIp: ipAddress,
            userAgent,
        });
        sessionTransferToken = sessionTransfer.token;
    }

    return c.json({
        success: true,
        accessToken,
        ...(sessionTransferToken ? { sessionTransferToken } : {}),
        user: {
            id: authResult.userId,
            email: authResult.identity.email,
            name: authResult.identity.name ?? null,
        },
    });
});

export { signin };

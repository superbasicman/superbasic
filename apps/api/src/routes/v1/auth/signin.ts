import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { setCookie } from 'hono/cookie';
import { COOKIE_NAME } from '@repo/auth';
import { authService } from '../../../lib/auth-service.js';
import { setRefreshTokenCookie } from './refresh-cookie.js';
import { authenticatePasswordIdentity } from '../../../lib/identity-provider.js';
import { checkFailedAuthRateLimit, trackFailedAuth } from '../../../middleware/rate-limit/failed-auth-tracking.js';

const signin = new Hono();

// --- Password ---

const passwordSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

signin.post('/password', zValidator('json', passwordSchema), async (c) => {
    const { email, password } = c.req.valid('json');
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

    const { token: accessToken } = await authService.issueAccessToken({
        userId: authResult.userId,
        sessionId: session.sessionId,
        clientType: session.clientType,
        mfaLevel: session.mfaLevel,
    });

    return c.json({
        success: true,
        accessToken,
        sessionId: session.sessionId,
        user: {
            id: authResult.userId,
            email: authResult.identity.email,
            name: authResult.identity.name ?? null,
        },
    });
});

export { signin };

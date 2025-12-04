import { Hono } from 'hono';
import { deleteCookie, getCookie } from 'hono/cookie';
import { prisma } from '@repo/database';
import { COOKIE_NAME } from '@repo/auth';

const revoke = new Hono();

revoke.post('/', async (c) => {
    const sessionId = getCookie(c, COOKIE_NAME);

    if (sessionId) {
        try {
            // Revoke the session
            await prisma.authSession.updateMany({
                where: {
                    id: sessionId,
                    revokedAt: null,
                },
                data: {
                    revokedAt: new Date(),
                },
            });
        } catch (e) {
            // Ignore errors during revocation
            console.error('Session revocation error:', e);
        }
    }

    deleteCookie(c, COOKIE_NAME);
    return c.json({ success: true });
});

export { revoke };

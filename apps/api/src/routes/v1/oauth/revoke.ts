import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { prisma } from '@repo/database';
import { parseOpaqueToken } from '@repo/auth';
import { csrfProtection } from '../../../middleware/csrf.js';
import type { AppBindings } from '../../../types/context.js';

const revoke = new Hono<AppBindings>();

const revokeSchema = z.object({
    token: z.string(),
    token_type_hint: z.enum(['access_token', 'refresh_token']).optional(),
});

/**
 * RFC 7009 compliant token revocation endpoint
 * Accepts token and optional token_type_hint to revoke refresh tokens or PATs
 */
revoke.post('/', csrfProtection, zValidator('form', revokeSchema), async (c) => {
    const { token, token_type_hint } = c.req.valid('form');

    try {
        // Parse the opaque token to extract tokenId and type
        const parsed = parseOpaqueToken(token);

        if (!parsed) {
            // Token format invalid, but per RFC 7009 Section 2.2, still return 200 OK
            return c.json({}, 200);
        }

        const now = new Date();

        // Determine token type from prefix:
        // rt = refresh token
        // sbf = PAT (Personal Access Token)
        // parseOpaqueToken returns tokenId as UUID only, prefix separately
        if (token_type_hint === 'refresh_token' || parsed.prefix === 'rt') {
            // Try to revoke as refresh token
            await prisma.refreshToken.updateMany({
                where: {
                    id: parsed.tokenId,
                    revokedAt: null,
                },
                data: {
                    revokedAt: now,
                },
            });
        } else {
            // Try to revoke as PAT (api_key)
            await prisma.apiKey.updateMany({
                where: {
                    id: parsed.tokenId,
                    revokedAt: null,
                },
                data: {
                    revokedAt: now,
                },
            });
        }

        // Per RFC 7009 Section 2.2: return 200 OK regardless of whether token existed
        return c.json({}, 200);
    } catch (error) {
        // Even on error, per RFC 7009, return 200 OK
        console.error('Token revocation error:', error);
        return c.json({}, 200);
    }
});

export { revoke };

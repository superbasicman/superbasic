import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { parseOpaqueToken } from '@repo/auth-core';
import { csrfProtection } from '../../../middleware/csrf.js';
import type { AppBindings } from '../../../types/context.js';
import { refreshTokenRepository, tokenRepository } from '../../../services/index.js';

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

        const isRefresh =
            token_type_hint === 'refresh_token' ||
            token.startsWith('rt_');

        if (isRefresh) {
            // Try to revoke as refresh token
            await refreshTokenRepository.revokeById(parsed.tokenId, now);
        } else {
            // Try to revoke as PAT (api_key)
            await tokenRepository.revokeById(parsed.tokenId, now);
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

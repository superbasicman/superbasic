import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.unmock('@repo/database');

import app from '../../../../app.js';
import { getTestPrisma, resetDatabase } from '../../../../test/setup.js';
import { createTestUser } from '../../../../test/helpers.js';
import { authService } from '../../../../lib/auth-service.js';
import { randomUUID } from 'node:crypto';

function buildFormRequest(body: Record<string, string>, headers?: Record<string, string>): Request {
    const params = new URLSearchParams(body);
    return new Request('http://localhost/v1/oauth/revoke', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...headers,
        },
        body: params,
    });
}

describe('POST /v1/oauth/revoke', () => {
    beforeEach(async () => {
        await resetDatabase();
    });

    it('revokes a valid refresh token', async () => {
        const prisma = getTestPrisma();
        const { user } = await createTestUser();

        const familyId = randomUUID();
        const sessionWithRefresh = await authService.createSessionWithRefresh({
            userId: user.id,
            identity: {
                provider: 'local_password',
                providerSubject: user.id,
                email: user.primaryEmail,
            },
            clientType: 'web',
            workspaceId: null,
            rememberMe: true,
            refreshFamilyId: familyId,
        });

        // No cookies sent - CSRF protection won't apply (per csrfProtection middleware)
        const response = await app.fetch(
            buildFormRequest({
                token: sessionWithRefresh.refresh.refreshToken,
            })
        );

        expect(response.status).toBe(200);

        // Verify the token was actually revoked
        const revokedToken = await prisma.refreshToken.findUnique({
            where: { id: sessionWithRefresh.refresh.token.id },
        });
        expect(revokedToken?.revokedAt).not.toBeNull();
    });

    it('revokes using token_type_hint=refresh_token', async () => {
        const prisma = getTestPrisma();
        const { user } = await createTestUser();

        const sessionWithRefresh = await authService.createSessionWithRefresh({
            userId: user.id,
            identity: {
                provider: 'local_password',
                providerSubject: user.id,
                email: user.primaryEmail,
            },
            clientType: 'web',
            workspaceId: null,
            rememberMe: true,
        });

        const response = await app.fetch(
            buildFormRequest({
                token: sessionWithRefresh.refresh.refreshToken,
                token_type_hint: 'refresh_token',
            })
        );

        expect(response.status).toBe(200);

        const revokedToken = await prisma.refreshToken.findUnique({
            where: { id: sessionWithRefresh.refresh.token.id },
        });
        expect(revokedToken?.revokedAt).not.toBeNull();
    });

    it('returns 200 OK for non-existent token (per RFC 7009)', async () => {
        const response = await app.fetch(
            buildFormRequest({
                token: 'rt_nonexistent_token_12345',
            })
        );

        // Per RFC 7009 Section 2.2, must return 200 OK even if token doesn't exist
        expect(response.status).toBe(200);
    });

    it('returns 200 OK for invalid token format (per RFC 7009)', async () => {
        const response = await app.fetch(
            buildFormRequest({
                token: 'totally-invalid-format',
            })
        );

        // Per RFC 7009, return 200 OK even for invalid tokens
        expect(response.status).toBe(200);
    });

    it('requires token parameter', async () => {
        const response = await app.fetch(
            new Request('http://localhost/v1/oauth/revoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({}),
            })
        );

        // Should return 400 for missing required parameter
        expect(response.status).toBe(400);
    });
});

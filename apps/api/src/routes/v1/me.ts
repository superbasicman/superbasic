/**
 * User profile endpoints
 *
 * Scope requirements:
 * - GET /v1/me: read:profile (or session auth)
 * - PATCH /v1/me: write:profile (or session auth)
 *
 * Note: Transaction endpoints (read:transactions, write:transactions) will be added in Phase 4-5
 * when Plaid integration and transaction management features are implemented.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { unifiedAuthMiddleware } from '../../middleware/auth-unified.js';
import { requireScope } from '../../middleware/scopes.js';
import { profileService } from '../../services/index.js';
import { UpdateProfileSchema, ProfileNotFoundError, InvalidProfileDataError } from '@repo/core';
import { prisma } from '@repo/database';
import type { AuthContext } from '@repo/auth-core';
import type { AppBindings } from '../../types/context.js';

const meRoute = new Hono<AppBindings>();

/**
 * GET /v1/me - Get current user profile
 * Requires: read:profile scope (for PAT auth) or session auth
 */
meRoute.get('/', unifiedAuthMiddleware, requireScope('read:profile'), async (c) => {
  const userId = c.get('userId');
  const profileId = c.get('profileId');
  const auth = c.get('auth') as AuthContext | null;

  if (!profileId) {
    return c.json({ error: 'Profile not found' }, 404);
  }

  try {
    const result = await profileService.getCurrentProfile({ userId });
    let workspaceSetting: string | null = null;
    try {
      const rows = await prisma.$queryRaw<{ workspace: string | null }[]>`
        SELECT current_setting('app.workspace_id', true) AS workspace
      `;
      const rawSetting = rows[0]?.workspace ?? null;
      workspaceSetting = rawSetting && rawSetting.length > 0 ? rawSetting : null;
    } catch (contextError) {
      console.warn('[me] Failed to read current_setting(app.workspace_id)', contextError);
    }

    return c.json({
      ...result,
      workspaceContext: {
        activeWorkspaceId: auth?.activeWorkspaceId ?? null,
        currentSettingWorkspaceId: workspaceSetting,
      },
    });
  } catch (error) {
    if (error instanceof ProfileNotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    throw error;
  }
});

/**
 * PATCH /v1/me - Update current user profile
 * Requires: write:profile scope (for PAT auth) or session auth
 */
meRoute.patch(
  '/',
  unifiedAuthMiddleware,
  requireScope('write:profile'),
  zValidator('json', UpdateProfileSchema),
  async (c) => {
    const userId = c.get('userId');
    const profileId = c.get('profileId');
    const { name, timezone, currency } = c.req.valid('json');

    try {
      const result = await profileService.updateProfile({
        userId,
        ...(profileId && { profileId }),
        ...(name !== undefined && { name }),
        ...(timezone !== undefined && { timezone }),
        ...(currency !== undefined && { currency }),
      });
      return c.json(result);
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return c.json({ error: error.message }, 404);
      }
      if (error instanceof InvalidProfileDataError) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }
  }
);

export { meRoute };

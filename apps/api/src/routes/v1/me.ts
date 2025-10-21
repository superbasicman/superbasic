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
import { prisma } from '@repo/database';
import { unifiedAuthMiddleware } from '../../middleware/auth-unified.js';
import { requireScope } from '../../middleware/scopes.js';
import type { AuthContext } from '../../types/context.js';

const meRoute = new Hono<AuthContext>();

/**
 * GET /v1/me - Get current user profile
 * Requires: read:profile scope (for PAT auth) or session auth
 */
meRoute.get('/', unifiedAuthMiddleware, requireScope('read:profile'), async (c) => {
  // Get userId from context (set by auth middleware)
  // profileId is also available via c.get('profileId') for business logic
  const userId = c.get('userId');

  // Fetch user and profile from database
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      profile: {
        select: {
          id: true,
          timezone: true,
          currency: true,
        },
      },
    },
  });

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Return user profile data
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
      profile: user.profile
        ? {
            id: user.profile.id,
            timezone: user.profile.timezone,
            currency: user.profile.currency,
          }
        : null,
    },
  });
});

/**
 * PATCH /v1/me - Update current user profile
 * Requires: write:profile scope (for PAT auth) or session auth
 */
meRoute.patch('/', unifiedAuthMiddleware, requireScope('write:profile'), async (c) => {
  const userId = c.get('userId');
  const profileId = c.get('profileId');

  // Parse request body
  const body = await c.req.json();
  const { name, timezone, currency } = body;

  // Validate input
  if (name !== undefined && (typeof name !== 'string' || name.length === 0 || name.length > 100)) {
    return c.json({ error: 'Name must be between 1 and 100 characters' }, 400);
  }

  if (timezone !== undefined && typeof timezone !== 'string') {
    return c.json({ error: 'Timezone must be a string' }, 400);
  }

  if (currency !== undefined && (typeof currency !== 'string' || currency.length !== 3)) {
    return c.json({ error: 'Currency must be a 3-character code' }, 400);
  }

  // Update user name if provided
  if (name !== undefined) {
    await prisma.user.update({
      where: { id: userId },
      data: { name },
    });
  }

  // Update profile if provided
  if ((timezone !== undefined || currency !== undefined) && profileId) {
    await prisma.profile.update({
      where: { id: profileId },
      data: {
        ...(timezone !== undefined && { timezone }),
        ...(currency !== undefined && { currency }),
      },
    });
  }

  // Fetch updated user and profile
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      profile: {
        select: {
          id: true,
          timezone: true,
          currency: true,
        },
      },
    },
  });

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
      profile: user.profile
        ? {
            id: user.profile.id,
            timezone: user.profile.timezone,
            currency: user.profile.currency,
          }
        : null,
    },
  });
});

export { meRoute };

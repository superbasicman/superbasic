import { Hono } from 'hono';
import { prisma } from '@repo/database';
import { authMiddleware } from '../../middleware/auth.js';
import type { AuthContext } from '../../types/context.js';

const meRoute = new Hono<AuthContext>();

meRoute.get('/', authMiddleware, async (c) => {
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

export { meRoute };

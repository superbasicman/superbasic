import { Hono } from 'hono';
import { prisma } from '@repo/database';
import { authMiddleware } from '../../middleware/auth.js';

// Define context type for auth middleware
type AuthContext = {
  Variables: {
    userId: string;
    userEmail: string;
    jti: string;
  };
};

const meRoute = new Hono<AuthContext>();

meRoute.get('/', authMiddleware, async (c) => {
  // Get userId from context (set by auth middleware)
  const userId = c.get('userId');

  // Fetch user from database
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
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
    },
  });
});

export { meRoute };

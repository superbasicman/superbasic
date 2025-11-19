import type { Context } from 'hono';
import { prisma } from '@repo/database';
import type { AppBindings } from '../../../types/context.js';

export async function getCurrentSession(c: Context<AppBindings>) {
  const auth = c.get('auth');

  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const session = auth.sessionId
    ? await prisma.session.findUnique({
        where: { id: auth.sessionId },
        select: {
          id: true,
          clientType: true,
          kind: true,
          lastUsedAt: true,
          createdAt: true,
          expiresAt: true,
          absoluteExpiresAt: true,
          mfaLevel: true,
        },
      })
    : null;

  return c.json({
    auth,
    user,
    session,
  });
}

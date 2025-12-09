import type { Context } from 'hono';
import type { AppBindings } from '../../../types/context.js';
import { sessionRepository, userRepository } from '../../../services/index.js';

export async function getCurrentSession(c: Context<AppBindings>) {
  const auth = c.get('auth');

  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const user = await userRepository.findSummaryById(auth.userId);

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const session = auth.sessionId
    ? await sessionRepository.findDetailsForUser(auth.sessionId, auth.userId)
    : null;

  return c.json({
    auth,
    user: {
      ...user,
      email: user.primaryEmail,
    },
    session: session
      ? {
          ...session,
          clientType: (session.clientInfo as any)?.type ?? 'unknown',
        }
      : null,
  });
}

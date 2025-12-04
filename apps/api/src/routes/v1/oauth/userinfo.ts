import { Hono } from 'hono';
import { authService } from '../../../lib/auth-service.js';

const userinfo = new Hono();

userinfo.get('/', async (c) => {
  const authorization = c.req.header('authorization');
  if (!authorization) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const auth = await authService.verifyRequest({ authorizationHeader: authorization });
    if (!auth || auth.principalType !== 'user') {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    return c.json({
      sub: auth.userId,
      profile_id: auth.profileId,
      workspace_id: auth.activeWorkspaceId,
      scope: auth.scopes.join(' '),
    });
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }
});

export { userinfo };

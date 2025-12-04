import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authService } from '../../../lib/auth-service.js';

const introspect = new Hono();

const introspectSchema = z.object({
  token: z.string(),
});

introspect.post('/', zValidator('form', introspectSchema), async (c) => {
  const { token } = c.req.valid('form');

  try {
    const auth = await authService.verifyRequest({
      authorizationHeader: `Bearer ${token}`,
    });

    if (!auth) {
      return c.json({ active: false });
    }

    return c.json({
      active: true,
      scope: (auth.scopes ?? []).join(' '),
      client_id: auth.clientId,
      token_type: auth.principalType === 'service' ? 'service_access' : 'access',
      sub: auth.userId,
      service_id: auth.principalType === 'service' ? auth.serviceId : undefined,
      exp: undefined,
    });
  } catch {
    return c.json({ active: false });
  }
});

export { introspect };

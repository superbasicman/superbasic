/**
 * GET /v1/tokens - List user's API tokens
 *
 * Requires session authentication
 * Returns all active tokens for the authenticated user
 * Token values are masked (only last 4 characters visible)
 */

import { Hono } from 'hono';
import { authMiddleware } from '../../../middleware/auth.js';
import { requireScope } from '../../../middleware/scopes.js';
import { listPersonalAccessTokens } from '../../../lib/pat-tokens.js';

type Variables = {
  userId: string;
};

const listTokensRoute = new Hono<{ Variables: Variables }>();

listTokensRoute.get('/', authMiddleware, requireScope('read:accounts'), async (c) => {
  const userId = c.get('userId') as string;

  const tokens = await listPersonalAccessTokens(userId);

  return c.json({ tokens });
});

export { listTokensRoute };

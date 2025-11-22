import { Hono } from 'hono';
import { authorizeRoute } from './authorize.js';
import type { AppBindings } from '../../../types/context.js';
import { tokenRoute } from './token.js';
import { authRateLimitMiddleware } from '../../../middleware/rate-limit/index.js';

const oauthRoutes = new Hono<AppBindings>();

oauthRoutes.route('/', authorizeRoute);
oauthRoutes.use('/token', authRateLimitMiddleware);
oauthRoutes.route('/', tokenRoute);

export { oauthRoutes };

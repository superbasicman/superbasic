import { Hono } from 'hono';
import { authorizeRoute } from './authorize.js';
import type { AppBindings } from '../../../types/context.js';
import { tokenRoute } from './token.js';

const oauthRoutes = new Hono<AppBindings>();

oauthRoutes.route('/', authorizeRoute);
oauthRoutes.route('/', tokenRoute);

export { oauthRoutes };

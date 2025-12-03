import { Hono } from 'hono';
import { authorize } from './authorize.js';
import { token } from './token.js';
import { revoke } from './revoke.js';

const oauthRoutes = new Hono();

oauthRoutes.route('/authorize', authorize);
oauthRoutes.route('/token', token);
oauthRoutes.route('/revoke', revoke);

export { oauthRoutes };

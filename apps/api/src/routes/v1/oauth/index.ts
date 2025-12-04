import { Hono } from 'hono';
import { authorize } from './authorize.js';
import { token } from './token.js';
import { revoke } from './revoke.js';
import { introspect } from './introspect.js';
import { userinfo } from './userinfo.js';
import { oauthRateLimitMiddleware } from '../../../middleware/rate-limit/index.js';

const oauthRoutes = new Hono();

oauthRoutes.use('/authorize', oauthRateLimitMiddleware('authorize'));
oauthRoutes.use('/token', oauthRateLimitMiddleware('token'));
oauthRoutes.use('/revoke', oauthRateLimitMiddleware('revoke'));
oauthRoutes.use('/introspect', oauthRateLimitMiddleware('introspect'));
oauthRoutes.route('/authorize', authorize);
oauthRoutes.route('/token', token);
oauthRoutes.route('/revoke', revoke);
oauthRoutes.route('/introspect', introspect);
oauthRoutes.route('/userinfo', userinfo);

export { oauthRoutes };

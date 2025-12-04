import { Hono } from 'hono';
import { authorize } from './authorize.js';
import { token } from './token.js';
import { revoke } from './revoke.js';
import { introspect } from './introspect.js';
import { userinfo } from './userinfo.js';

const oauthRoutes = new Hono();

oauthRoutes.route('/authorize', authorize);
oauthRoutes.route('/token', token);
oauthRoutes.route('/revoke', revoke);
oauthRoutes.route('/introspect', introspect);
oauthRoutes.route('/userinfo', userinfo);

export { oauthRoutes };

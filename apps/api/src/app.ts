import { Hono } from 'hono';
import { corsMiddleware } from './middleware/cors.js';
import {
  authRateLimitMiddleware,
  credentialsRateLimitMiddleware,
} from './middleware/rate-limit/index.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { healthRoute } from './routes/v1/health.js';
import { meRoute } from './routes/v1/me.js';
import { registerRoute } from './routes/v1/register.js';
import { tokensRoute } from './routes/v1/tokens/index.js';

import { attachAuthContext } from './middleware/auth-context.js';
import { requireVerifiedEmail } from './middleware/require-verified-email.js';
import { bulkRevokeSessions, bulkRevokeTokens } from './routes/v1/auth/bulk-revoke.js';
import { google } from './routes/v1/auth/google.js';
import { getJwks } from './routes/v1/auth/jwks.js';
import { logout } from './routes/v1/auth/logout.js';
import { magicLink } from './routes/v1/auth/magic-link.js';
import { verifyEmail } from './routes/v1/auth/verify-email.js';
import { resendVerification } from './routes/v1/auth/resend-verification.js';
import { refreshTokenValidator, refreshTokens } from './routes/v1/auth/refresh.js';
import { getCurrentSession } from './routes/v1/auth/session.js';
import { deleteSession, listSessions } from './routes/v1/auth/sessions.js';
import { signin } from './routes/v1/auth/signin.js';
import { handleSsoLogout, ssoLogoutValidator } from './routes/v1/auth/sso-logout.js';
import { oauthRoutes } from './routes/v1/oauth/index.js';
import type { AppBindings } from './types/context.js';

const app = new Hono<AppBindings>();

// Apply request ID middleware first for log correlation
app.use('*', requestIdMiddleware);

// Apply CORS middleware globally for cross-origin cookie support
app.use('*', corsMiddleware);

import { openidConfiguration } from './routes/openid-configuration.js';

// Reserve c.var.auth for the auth-core context
app.use('*', attachAuthContext);

// Require email verification for authenticated users on protected routes
app.use('*', requireVerifiedEmail);

app.route('/.well-known/openid-configuration', openidConfiguration);
app.get('/.well-known/jwks.json', getJwks);

app.route('/health', healthRoute);

// Mount v1 routes
const v1 = new Hono<AppBindings>();

const authRoutes = new Hono<AppBindings>();
authRoutes.get('/session', getCurrentSession);
authRoutes.get('/sessions', listSessions);
authRoutes.delete('/sessions/:id', deleteSession);
authRoutes.post('/sessions/revoke-all', bulkRevokeSessions);
authRoutes.post('/tokens/revoke-all', bulkRevokeTokens);
authRoutes.get('/jwks.json', getJwks);
authRoutes.use('/refresh', authRateLimitMiddleware);
authRoutes.use('/logout', authRateLimitMiddleware);
authRoutes.use('/sso/logout', authRateLimitMiddleware);
authRoutes.post('/refresh', refreshTokenValidator, refreshTokens);
authRoutes.post('/logout', logout);
authRoutes.post('/sso/logout', ssoLogoutValidator, handleSsoLogout);
// Mount routes
authRoutes.use('/signin/*', credentialsRateLimitMiddleware);
authRoutes.use('/google', authRateLimitMiddleware);
authRoutes.use('/magic-link', authRateLimitMiddleware);

authRoutes.route('/signin', signin);
authRoutes.route('/google', google);
authRoutes.route('/magic-link', magicLink);
authRoutes.route('/verify-email', verifyEmail);
authRoutes.use('/resend-verification', authRateLimitMiddleware);
authRoutes.route('/resend-verification', resendVerification);

v1.route('/auth', authRoutes);
v1.route('/oauth', oauthRoutes);

v1.route('/health', healthRoute);

// Apply rate limiting to auth endpoints (10 req/min per IP)
v1.use('/register', authRateLimitMiddleware);

v1.route('/register', registerRoute);
v1.route('/me', meRoute);
v1.route('/tokens', tokensRoute);
v1.route('/oauth', oauthRoutes);

app.route('/v1', v1);

export default app;

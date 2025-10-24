import { Hono } from 'hono';
import { corsMiddleware } from './middleware/cors.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { authRateLimitMiddleware, magicLinkRateLimitMiddleware } from './middleware/rate-limit.js';
import { healthRoute } from './routes/v1/health.js';
import { registerRoute } from './routes/v1/register.js';
import { loginRoute } from './routes/v1/login.js';
import { logoutRoute } from './routes/v1/logout.js';
import { meRoute } from './routes/v1/me.js';
import { tokensRoute } from './routes/v1/tokens/index.js';
import { authApp } from './auth.js';

const app = new Hono();

// Apply request ID middleware first for log correlation
app.use('*', requestIdMiddleware);

// Apply CORS middleware globally for cross-origin cookie support
app.use('*', corsMiddleware);

app.route('/health', healthRoute);

// Mount v1 routes
const v1 = new Hono();

// Apply magic link rate limiting (3 req/hour per email) before Auth.js handler
// Auth.js uses "nodemailer" as the provider ID for email authentication
v1.use('/auth/signin/nodemailer', magicLinkRateLimitMiddleware);

// Mount Auth.js handler (handles /v1/auth/*)
v1.route('/auth', authApp);

v1.route('/health', healthRoute);

// Apply rate limiting to auth endpoints (10 req/min per IP)
v1.use('/register', authRateLimitMiddleware);
v1.use('/login', authRateLimitMiddleware);
v1.use('/logout', authRateLimitMiddleware);

v1.route('/register', registerRoute);
v1.route('/login', loginRoute);
v1.route('/logout', logoutRoute);
v1.route('/me', meRoute);
v1.route('/tokens', tokensRoute);

app.route('/v1', v1);

export default app;

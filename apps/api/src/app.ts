import { Hono } from 'hono';
import { corsMiddleware } from './middleware/cors.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { authRateLimitMiddleware } from './middleware/rate-limit/index.js';
import { healthRoute } from './routes/v1/health.js';
import { registerRoute } from './routes/v1/register.js';
import { meRoute } from './routes/v1/me.js';
import { tokensRoute } from './routes/v1/tokens/index.js';
import { authApp } from './auth.js';
import type { AppBindings } from './types/context.js';
import { attachAuthContext } from './middleware/auth-context.js';
import { getCurrentSession } from './routes/v1/auth/session.js';
import { getJwks } from './routes/v1/auth/jwks.js';

const app = new Hono<AppBindings>();

// Apply request ID middleware first for log correlation
app.use('*', requestIdMiddleware);

// Apply CORS middleware globally for cross-origin cookie support
app.use('*', corsMiddleware);

// Reserve c.var.auth for the auth-core context
app.use('*', attachAuthContext);

app.get('/.well-known/jwks.json', getJwks);

app.route('/health', healthRoute);

// Mount v1 routes
const v1 = new Hono<AppBindings>();

const authRoutes = new Hono<AppBindings>();
authRoutes.get('/session', getCurrentSession);
authRoutes.get('/jwks.json', getJwks);
// Mount Auth.js handler (handles remaining /v1/auth/*)
authRoutes.route('/', authApp);

v1.route('/auth', authRoutes);

v1.route('/health', healthRoute);

// Apply rate limiting to auth endpoints (10 req/min per IP)
v1.use('/register', authRateLimitMiddleware);

v1.route('/register', registerRoute);
v1.route('/me', meRoute);
v1.route('/tokens', tokensRoute);

app.route('/v1', v1);

export default app;

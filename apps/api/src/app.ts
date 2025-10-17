import { Hono } from 'hono';
import { corsMiddleware } from './middleware/cors.js';
import { authRateLimitMiddleware } from './middleware/rate-limit.js';
import { healthRoute } from './routes/v1/health.js';
import { registerRoute } from './routes/v1/register.js';
import { loginRoute } from './routes/v1/login.js';
import { logoutRoute } from './routes/v1/logout.js';
import { meRoute } from './routes/v1/me.js';

const app = new Hono();

// Apply CORS middleware globally for cross-origin cookie support
app.use('*', corsMiddleware);

app.route('/health', healthRoute);

// Mount v1 routes
const v1 = new Hono();
v1.route('/health', healthRoute);

// Apply rate limiting to auth endpoints (10 req/min per IP)
v1.use('/register', authRateLimitMiddleware);
v1.use('/login', authRateLimitMiddleware);
v1.use('/logout', authRateLimitMiddleware);

v1.route('/register', registerRoute);
v1.route('/login', loginRoute);
v1.route('/logout', logoutRoute);
v1.route('/me', meRoute);

app.route('/v1', v1);

export default app;

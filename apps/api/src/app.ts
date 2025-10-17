import { Hono } from 'hono';
import { healthRoute } from './routes/v1/health.js';

const app = new Hono();

// Mount v1 routes
const v1 = new Hono();
v1.route('/health', healthRoute);

app.route('/v1', v1);

export default app;

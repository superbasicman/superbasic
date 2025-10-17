import { serve } from '@hono/node-server';
import { logger } from '@repo/observability';
import app from './app.js';
import { initializeAuditLogging } from './lib/audit-logger.js';

const port = Number(process.env.PORT) || 3000;

// Initialize audit logging for authentication events
initializeAuditLogging();

logger.info({ port }, 'Starting server');

serve({
  fetch: app.fetch,
  port,
});

logger.info({ port }, 'Server running');

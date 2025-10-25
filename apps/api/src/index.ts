import { serve } from '@hono/node-server';
import { logger } from '@repo/observability';
import app from './app.js';
import { initializeAuditLogging } from './lib/audit-logger.js';

const port = Number(process.env.PORT) || 3000;

// Initialize audit logging for authentication events
initializeAuditLogging();

// Validate OAuth configuration
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  logger.warn('Google OAuth not configured - GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing');
} else {
  logger.info('Google OAuth configured successfully');
}

logger.info({ port }, 'Starting server');

serve({
  fetch: app.fetch,
  port,
});

logger.info({ port }, 'Server running');

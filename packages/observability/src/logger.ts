import pino from 'pino';

/**
 * Create a structured logger instance with Pino
 *
 * This is a placeholder implementation that will be expanded with:
 * - Environment-based log levels
 * - Request ID correlation
 * - Sentry/Logtail integration
 * - Audit trail emitters
 */
export function createLogger(options?: pino.LoggerOptions) {
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    ...options,
  });
}

/**
 * Default logger instance for convenience
 */
export const logger = createLogger();

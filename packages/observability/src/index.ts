/**
 * @repo/observability
 *
 * Logging, tracing, and audit trail utilities for SuperBasic Finance.
 *
 * Planned features:
 * - Structured logging with Pino
 * - Request ID correlation
 * - Sentry integration for error tracking
 * - Logtail integration for log aggregation
 * - Audit trail emitters for sensitive operations
 */

export { createLogger, logger } from './logger.js';

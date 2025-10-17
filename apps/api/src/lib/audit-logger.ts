import { authEvents, type AuthEvent } from '@repo/auth';
import { logger } from '@repo/observability';

/**
 * Initialize audit logging for authentication events
 * Logs all authentication events to structured logging service
 * Never logs passwords or JWT tokens
 */
export function initializeAuditLogging() {
  authEvents.on(handleAuthEvent);
  logger.info('Audit logging initialized for authentication events');
}

/**
 * Handle authentication events and log them to structured logging
 */
async function handleAuthEvent(event: AuthEvent) {
  const { type, userId, email, ip, timestamp, metadata } = event;

  // Create structured log entry
  const logEntry = {
    event: type,
    userId: userId || 'unknown',
    email: email || 'unknown',
    ip: ip || 'unknown',
    timestamp: timestamp.toISOString(),
    success: type.includes('success') || type === 'user.registered',
    ...(metadata && { metadata }),
  };

  // Log based on event type
  switch (type) {
    case 'user.registered':
      logger.info(logEntry, 'User registered successfully');
      break;

    case 'user.login.success':
      logger.info(logEntry, 'User login successful');
      break;

    case 'user.login.failed':
      logger.warn(logEntry, 'User login failed');
      break;

    case 'user.logout':
      logger.info(logEntry, 'User logged out');
      break;

    default:
      logger.info(logEntry, 'Authentication event');
  }
}

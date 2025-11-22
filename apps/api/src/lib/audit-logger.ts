import { authEvents, type AuthEvent } from '@repo/auth';
import { logger } from '@repo/observability';

/**
 * Initialize audit logging for authentication events
 * Logs all authentication events to structured logging service
 * Automatically redacts sensitive data (tokens, passwords, Authorization headers)
 */
export function initializeAuditLogging() {
  authEvents.on(handleAuthEvent);
  logger.info('Audit logging initialized for authentication events');
}

/**
 * Handle authentication events and log them to structured logging
 * All sensitive data is automatically redacted by the logger
 */
async function handleAuthEvent(event: AuthEvent) {
  const { type, userId, email, ip, timestamp, metadata } = event;

  // Extract requestId from metadata if present
  const requestId = metadata?.requestId as string | undefined;

  // Create structured log entry
  const logEntry = {
    event: type,
    userId: userId || 'unknown',
    email: email || 'unknown',
    ip: ip || 'unknown',
    timestamp: timestamp.toISOString(),
    success: type.includes('success') || type === 'user.registered',
    ...(requestId && { requestId }),
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

    case 'user.status_changed':
      logger.info(logEntry, 'User account status changed');
      break;

    case 'user.logout':
      logger.info(logEntry, 'User logged out');
      break;

    case 'session.revoked':
      logger.info(logEntry, 'Session revoked');
      break;

    case 'refresh.reuse_detected':
      logger.error(logEntry, 'Refresh token reuse detected');
      break;

    case 'refresh.rotated':
      logger.info(logEntry, 'Refresh token rotated');
      break;

    case 'token.created':
      logger.info(logEntry, 'API token created');
      break;

    case 'token.updated':
      logger.info(logEntry, 'API token updated');
      break;

    case 'token.used':
      logger.info(logEntry, 'API token used successfully');
      break;

    case 'token.revoked':
      logger.info(logEntry, 'API token revoked');
      break;

    case 'token.auth_failed':
      logger.warn(logEntry, 'API token authentication failed');
      break;

    case 'token.scope_denied':
      logger.warn(logEntry, 'API token scope denied');
      break;

    default:
      logger.info(logEntry, 'Authentication event');
  }
}

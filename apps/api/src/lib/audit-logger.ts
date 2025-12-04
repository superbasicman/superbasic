import { authEvents, type AuthEvent } from '@repo/auth';
import { prisma, Prisma } from '@repo/database';
import { logger } from '@repo/observability';

type SecurityEventPayload = {
  userId?: string | null;
  workspaceId?: string | null;
  serviceId?: string | null;
  eventType: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
};

const SECURITY_EVENT_TYPES = new Set<AuthEvent['type']>([
  'token.created',
  'token.updated',
  'token.revoked',
  'refresh.reuse_detected',
  'auth.failed_rate_limited',
  'user.mfa_enrolled',
  'user.mfa_challenged',
  'user.mfa_challenge_failed',
  'user.step_up',
  'user.step_up_failed',
  'session.revoked',
]);

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

    case 'user.mfa_enrolled':
      logger.info(logEntry, 'MFA enrollment event');
      break;

    case 'user.mfa_challenged':
      logger.info(logEntry, 'MFA challenge succeeded');
      break;

    case 'user.mfa_challenge_failed':
      logger.warn(logEntry, 'MFA challenge failed');
      break;

    case 'user.step_up':
      logger.info(logEntry, 'Step-up requirement satisfied');
      break;

    case 'user.step_up_failed':
      logger.warn(logEntry, 'Step-up requirement failed');
      break;

    case 'user.sso.login':
      logger.info(logEntry, 'SSO login');
      break;

    case 'user.sso.logout':
      logger.info(logEntry, 'SSO logout/back-channel');
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

  // Persist high-value security events into the audit table
  try {
    const payload = mapSecurityEvent(event);
    if (payload) {
      await prisma.securityEvent.create({ data: payload });
    }
  } catch (error) {
    logger.error({ err: error, eventType: type }, 'Failed to persist security event');
  }
}

function mapSecurityEvent(event: AuthEvent): SecurityEventPayload | null {
  if (!SECURITY_EVENT_TYPES.has(event.type)) {
    return null;
  }

  const metadata = (event.metadata ?? {}) as Record<string, unknown>;
  const workspaceId = toUuid(metadata.workspaceId);
  const serviceId = toUuid(metadata.serviceId ?? metadata.clientId);
  const ipAddress = pickString(metadata.ip) ?? event.ip ?? null;
  const userAgent = pickString(metadata.userAgent);

  const payload: SecurityEventPayload = {
    userId: event.userId ?? null,
    workspaceId,
    serviceId,
    eventType: event.type,
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
  };

  if (Object.keys(metadata).length > 0) {
    payload.metadata = metadata as Prisma.InputJsonValue;
  }

  return payload;
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function toUuid(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed && /^[0-9a-fA-F-]{32,36}$/.test(trimmed) ? trimmed : null;
}

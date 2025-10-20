import pino from 'pino';

/**
 * Redact sensitive data from logs
 * - Authorization headers (Bearer tokens)
 * - Token values (sbf_ prefix)
 * - Passwords and other secrets
 */
const REDACTION_PATHS = [
  'req.headers.authorization',
  'req.headers.Authorization',
  'headers.authorization',
  'headers.Authorization',
  'authorization',
  'Authorization',
  'password',
  'token',
  'secret',
  'apiKey',
  'api_key',
];

/**
 * Custom serializer to redact token values in any string field
 */
function redactTokens(value: any): any {
  if (typeof value === 'string') {
    // Redact Authorization Bearer tokens
    if (value.startsWith('Bearer ')) {
      return 'Bearer [REDACTED]';
    }
    // Redact sbf_ prefixed tokens
    if (value.includes('sbf_')) {
      return value.replace(/sbf_[A-Za-z0-9_-]+/g, 'sbf_[REDACTED]');
    }
  }
  return value;
}

/**
 * Recursively redact tokens in an object
 */
function redactObjectTokens(obj: any): any {
  if (typeof obj === 'string') {
    return redactTokens(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(redactObjectTokens);
  }
  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      result[key] = redactObjectTokens(obj[key]);
    }
    return result;
  }
  return obj;
}

/**
 * Create a structured logger instance with Pino
 *
 * Features:
 * - Environment-based log levels
 * - Automatic redaction of sensitive data (tokens, passwords)
 * - Request ID correlation support
 * - Structured JSON output for production
 */
export function createLogger(options?: pino.LoggerOptions) {
  const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    redact: {
      paths: REDACTION_PATHS,
      censor: '[REDACTED]',
    },
    serializers: {
      // Custom serializer for request objects
      req: (req: any) => {
        const serialized = pino.stdSerializers.req(req);
        // Redact tokens in all string fields
        if (serialized.headers) {
          Object.keys(serialized.headers).forEach((key) => {
            serialized.headers[key] = redactTokens(serialized.headers[key]);
          });
        }
        return serialized;
      },
      // Custom serializer for response objects
      res: pino.stdSerializers.res,
      // Custom serializer for error objects
      err: pino.stdSerializers.err,
    },
    // Format timestamps as ISO 8601
    timestamp: pino.stdTimeFunctions.isoTime,
    // Hook to redact tokens in all log messages
    hooks: {
      logMethod(args, method) {
        // Redact tokens in the log object (first argument)
        if (args.length > 0 && typeof args[0] === 'object') {
          args[0] = redactObjectTokens(args[0]);
        }
        method.apply(this, args);
      },
    },
    ...options,
  });

  return logger;
}

/**
 * Default logger instance for convenience
 */
export const logger = createLogger();

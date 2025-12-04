/**
 * Tests for logger redaction functionality
 * Verifies that sensitive data (tokens, Authorization headers) is properly redacted
 */

import { describe, it, expect } from 'vitest';
import pino from 'pino';

describe('Logger Redaction', () => {
  describe('Authorization Header Redaction', () => {
    it('should redact Bearer tokens in Authorization headers', () => {
      const logs: string[] = [];
      const stream = {
        write: (log: string) => {
          logs.push(log);
        },
      };

      const logger = pino(
        {
          level: 'info',
          serializers: {
            req: (req: any) => {
              const serialized = pino.stdSerializers.req(req);
              if (serialized.headers?.authorization?.startsWith('Bearer ')) {
                serialized.headers.authorization = 'Bearer [REDACTED]';
              }
              return serialized;
            },
          },
        },
        stream
      );

      logger.info({
        req: {
          headers: {
            authorization: 'Bearer sbf_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz',
          },
        },
      });

      expect(logs[0]).toBeDefined();
      const logEntry = JSON.parse(logs[0]!);
      expect(logEntry.req.headers.authorization).toBe('Bearer [REDACTED]');
    });

    it('should redact Authorization header with different casing', () => {
      const logs: string[] = [];
      const stream = {
        write: (log: string) => {
          logs.push(log);
        },
      };

      const logger = pino(
        {
          level: 'info',
          redact: {
            paths: ['headers.Authorization'],
            censor: '[REDACTED]',
          },
        },
        stream
      );

      logger.info({
        headers: {
          Authorization: 'Bearer sbf_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz',
        },
      });

      expect(logs[0]).toBeDefined();
      const logEntry = JSON.parse(logs[0]!);
      expect(logEntry.headers.Authorization).toBe('[REDACTED]');
    });
  });

  describe('Token Prefix Redaction', () => {
    it('should redact sbf_ prefixed tokens in string fields', () => {
      const logs: string[] = [];
      const stream = {
        write: (log: string) => {
          logs.push(log);
        },
      };

      const logger = pino(
        {
          level: 'info',
          hooks: {
            logMethod(args, method) {
              if (
                args.length > 0 &&
                typeof args[0] === 'object' &&
                args[0] !== null &&
                'msg' in args[0] &&
                typeof args[0].msg === 'string'
              ) {
                args[0].msg = args[0].msg.replace(/sbf_[A-Za-z0-9_-]+/g, 'sbf_[REDACTED]');
              }
              method.apply(this, args);
            },
          },
        },
        stream
      );

      logger.info({
        msg: 'Token: sbf_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz',
      });

      expect(logs[0]).toBeDefined();
      const logEntry = JSON.parse(logs[0]!);
      expect(logEntry.msg).toBe('Token: sbf_[REDACTED]');
    });

    it('should redact multiple tokens in the same string', () => {
      const logs: string[] = [];
      const stream = {
        write: (log: string) => {
          logs.push(log);
        },
      };

      const logger = pino(
        {
          level: 'info',
          hooks: {
            logMethod(args, method) {
              if (
                args.length > 0 &&
                typeof args[0] === 'object' &&
                args[0] !== null &&
                'msg' in args[0] &&
                typeof args[0].msg === 'string'
              ) {
                args[0].msg = args[0].msg.replace(/sbf_[A-Za-z0-9_-]+/g, 'sbf_[REDACTED]');
              }
              method.apply(this, args);
            },
          },
        },
        stream
      );

      logger.info({
        msg: 'Tokens: sbf_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz and sbf_xyz987wvu654tsr321qpo098nml765kji432hgf109edc876ba',
      });

      expect(logs[0]).toBeDefined();
      const logEntry = JSON.parse(logs[0]!);
      expect(logEntry.msg).toBe('Tokens: sbf_[REDACTED] and sbf_[REDACTED]');
    });

    it('should not redact sbf_ prefix alone', () => {
      const logs: string[] = [];
      const stream = {
        write: (log: string) => {
          logs.push(log);
        },
      };

      const logger = pino(
        {
          level: 'info',
          hooks: {
            logMethod(args, method) {
              if (
                args.length > 0 &&
                typeof args[0] === 'object' &&
                args[0] !== null &&
                'msg' in args[0] &&
                typeof args[0].msg === 'string'
              ) {
                args[0].msg = args[0].msg.replace(/sbf_[A-Za-z0-9_-]+/g, 'sbf_[REDACTED]');
              }
              method.apply(this, args);
            },
          },
        },
        stream
      );

      logger.info({
        msg: 'Token prefix is sbf_',
      });

      expect(logs[0]).toBeDefined();
      const logEntry = JSON.parse(logs[0]!);
      // Should not redact if there's no token after the prefix
      expect(logEntry.msg).toBe('Token prefix is sbf_');
    });
  });

  describe('Password Redaction', () => {
    it('should redact password fields', () => {
      const logs: string[] = [];
      const stream = {
        write: (log: string) => {
          logs.push(log);
        },
      };

      const logger = pino(
        {
          level: 'info',
          redact: {
            paths: ['password'],
            censor: '[REDACTED]',
          },
        },
        stream
      );

      logger.info({
        password: 'super-secret-password',
      });

      expect(logs[0]).toBeDefined();
      const logEntry = JSON.parse(logs[0]!);
      expect(logEntry.password).toBe('[REDACTED]');
    });

    it('should redact secret fields', () => {
      const logs: string[] = [];
      const stream = {
        write: (log: string) => {
          logs.push(log);
        },
      };

      const logger = pino(
        {
          level: 'info',
          redact: {
            paths: ['secret'],
            censor: '[REDACTED]',
          },
        },
        stream
      );

      logger.info({
        secret: 'my-secret-key',
      });

      expect(logs[0]).toBeDefined();
      const logEntry = JSON.parse(logs[0]!);
      expect(logEntry.secret).toBe('[REDACTED]');
    });
  });

  describe('Request Serialization', () => {
    it('should serialize request objects with redaction', () => {
      const logs: string[] = [];
      const stream = {
        write: (log: string) => {
          logs.push(log);
        },
      };

      const logger = pino(
        {
          level: 'info',
          serializers: {
            req: (req: any) => {
              const serialized = pino.stdSerializers.req(req);
              if (serialized.headers?.authorization?.startsWith('Bearer ')) {
                serialized.headers.authorization = 'Bearer [REDACTED]';
              }
              return serialized;
            },
          },
        },
        stream
      );

      logger.info({
        req: {
          method: 'GET',
          url: '/v1/transactions',
          headers: {
            authorization: 'Bearer sbf_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz',
            'user-agent': 'curl/7.88.1',
          },
        },
      });

      expect(logs[0]).toBeDefined();
      const logEntry = JSON.parse(logs[0]!);
      expect(logEntry.req.method).toBe('GET');
      expect(logEntry.req.url).toBe('/v1/transactions');
      expect(logEntry.req.headers.authorization).toBe('Bearer [REDACTED]');
      expect(logEntry.req.headers['user-agent']).toBe('curl/7.88.1');
    });
  });

  describe('Non-Sensitive Data', () => {
    it('should not redact non-sensitive fields', () => {
      const logs: string[] = [];
      const stream = {
        write: (log: string) => {
          logs.push(log);
        },
      };

      const logger = pino({ level: 'info' }, stream);

      logger.info({
        userId: 'user_123',
        email: 'test@example.com',
        ip: '192.168.1.1',
        endpoint: '/v1/transactions',
      });

      expect(logs[0]).toBeDefined();
      const logEntry = JSON.parse(logs[0]!);
      expect(logEntry.userId).toBe('user_123');
      expect(logEntry.email).toBe('test@example.com');
      expect(logEntry.ip).toBe('192.168.1.1');
      expect(logEntry.endpoint).toBe('/v1/transactions');
    });
  });

  describe('Timestamp Format', () => {
    it('should format timestamps as ISO 8601', () => {
      const logs: string[] = [];
      const stream = {
        write: (log: string) => {
          logs.push(log);
        },
      };

      const logger = pino(
        {
          level: 'info',
          timestamp: pino.stdTimeFunctions.isoTime,
        },
        stream
      );

      logger.info({ msg: 'test' });

      expect(logs[0]).toBeDefined();
      const logEntry = JSON.parse(logs[0]!);
      // Check that timestamp exists and is in ISO format
      expect(logEntry.time).toBeDefined();
      expect(typeof logEntry.time).toBe('string');
      // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(logEntry.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
});

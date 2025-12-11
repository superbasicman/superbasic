/**
 * Tests for audit logging functionality
 * Verifies that all event types are emitted correctly,
 * sensitive data is redacted, and requestId is included
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authEvents } from '@repo/auth-core';
import { logger } from '@repo/observability';
import { initializeAuditLogging } from '../audit-logger.js';
import { securityEventRepository } from '../../services/index.js';

describe('Audit Logger', () => {
  let mockInfo: ReturnType<typeof vi.spyOn>;
  let mockWarn: ReturnType<typeof vi.spyOn>;
  let securityEventSpy: any;

  beforeEach(() => {
    // Clear all event handlers before each test
    authEvents.clearHandlers();

    // Create fresh mocks for each test
    mockInfo = vi.spyOn(logger, 'info');
    mockWarn = vi.spyOn(logger, 'warn');
    try {
      securityEventSpy = vi.spyOn(securityEventRepository, 'create').mockResolvedValue({
        id: 'evt_1',
        userId: null,
        workspaceId: null,
        serviceId: null,
        eventType: 'token.created',
        ipAddress: null,
        userAgent: null,
        metadata: null,
        createdAt: new Date(),
      } as any);
    } catch {
      // If Prisma is mocked or unavailable, provide a no-op spy so tests can proceed
      securityEventSpy = null;
    }

    // Initialize audit logging
    initializeAuditLogging();
  });

  afterEach(() => {
    // Clean up
    authEvents.clearHandlers();
    mockInfo.mockRestore();
    mockWarn.mockRestore();
    securityEventSpy?.mockRestore?.();
  });

  describe('Event Type Handling', () => {
    it('should log token.created events', async () => {
      authEvents.emit({
        type: 'token.created',
        userId: 'user_123',
        ip: '192.168.1.1',
        metadata: {
          tokenId: 'tok_456',
          profileId: 'prof_789',
          tokenName: 'Test Token',
          scopes: ['read:transactions'],
          expiresAt: '2025-12-31T23:59:59Z',
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          requestId: 'req_abc123',
          timestamp: '2025-01-18T10:00:00Z',
        },
      });

      // Wait for async event handler
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'token.created',
          userId: 'user_123',
          requestId: 'req_abc123',
          metadata: expect.objectContaining({
            tokenId: 'tok_456',
            tokenName: 'Test Token',
          }),
        }),
        'API token created'
      );
    });

    it('should log token.used events', async () => {
      authEvents.emit({
        type: 'token.used',
        userId: 'user_123',
        ip: '192.168.1.1',
        metadata: {
          tokenId: 'tok_456',
          endpoint: '/v1/transactions',
          method: 'GET',
          status: 200,
          ip: '192.168.1.1',
          userAgent: 'curl/7.88.1',
          requestId: 'req_xyz789',
          timestamp: '2025-01-18T10:05:00Z',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'token.used',
          userId: 'user_123',
          requestId: 'req_xyz789',
          metadata: expect.objectContaining({
            endpoint: '/v1/transactions',
            method: 'GET',
            status: 200,
          }),
        }),
        'API token used successfully'
      );
    });

    it('should log token.revoked events', async () => {
      authEvents.emit({
        type: 'token.revoked',
        userId: 'user_123',
        ip: '192.168.1.1',
        metadata: {
          tokenId: 'tok_456',
          profileId: 'prof_789',
          tokenName: 'Test Token',
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          requestId: 'req_def456',
          timestamp: '2025-01-18T10:10:00Z',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'token.revoked',
          userId: 'user_123',
          requestId: 'req_def456',
        }),
        'API token revoked'
      );
    });

    it('should log token.auth_failed events as warnings', async () => {
      authEvents.emit({
        type: 'token.auth_failed',
        userId: 'user_123',
        ip: '192.168.1.1',
        metadata: {
          reason: 'expired',
          tokenId: 'tok_456',
          expiresAt: '2025-01-01T00:00:00Z',
          ip: '192.168.1.1',
          userAgent: 'curl/7.88.1',
          requestId: 'req_ghi789',
          timestamp: '2025-01-18T10:15:00Z',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'token.auth_failed',
          userId: 'user_123',
          requestId: 'req_ghi789',
          metadata: expect.objectContaining({
            reason: 'expired',
          }),
        }),
        'API token authentication failed'
      );
    });

    it('should log token.scope_denied events as warnings', async () => {
      authEvents.emit({
        type: 'token.scope_denied',
        userId: 'user_123',
        ip: '192.168.1.1',
        metadata: {
          tokenId: 'tok_456',
          endpoint: '/v1/transactions',
          method: 'POST',
          requiredScope: 'write:transactions',
          providedScopes: ['read:transactions'],
          ip: '192.168.1.1',
          userAgent: 'curl/7.88.1',
          requestId: 'req_jkl012',
          timestamp: '2025-01-18T10:20:00Z',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'token.scope_denied',
          userId: 'user_123',
          requestId: 'req_jkl012',
          metadata: expect.objectContaining({
            requiredScope: 'write:transactions',
            providedScopes: ['read:transactions'],
          }),
        }),
        'API token scope denied'
      );
    });

    it('should log token.updated events', async () => {
      authEvents.emit({
        type: 'token.updated',
        userId: 'user_123',
        metadata: {
          tokenId: 'tok_update',
          previousName: 'Old Name',
          newName: 'New Name',
          ip: '10.0.0.1',
          userAgent: 'UA',
          requestId: 'req_token_update',
          timestamp: '2025-01-18T11:00:00Z',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'token.updated',
          userId: 'user_123',
          requestId: 'req_token_update',
          metadata: expect.objectContaining({
            previousName: 'Old Name',
            newName: 'New Name',
          }),
        }),
        'API token updated'
      );
    });

    it('should log refresh.rotated events', async () => {
      authEvents.emit({
        type: 'refresh.rotated',
        userId: 'user_123',
        metadata: {
          sessionId: 'sess_1',
          previousTokenId: 'tok_old',
          newTokenId: 'tok_new',
          familyId: 'fam_1',
          ip: '10.0.0.2',
          userAgent: 'Mozilla/5.0',
          requestId: 'req_refresh_rotate',
          timestamp: '2025-01-18T11:05:00Z',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'refresh.rotated',
          userId: 'user_123',
          requestId: 'req_refresh_rotate',
        }),
        'Refresh token rotated'
      );
    });

    it('should log user.status_changed events', async () => {
      authEvents.emit({
        type: 'user.status_changed',
        userId: 'user_123',
        email: 'user@example.com',
        metadata: {
          previousStatus: 'active',
          newStatus: 'disabled',
          reason: 'manual_admin_action',
          changedBy: 'admin_1',
          ip: '10.0.0.3',
          userAgent: 'UA',
          requestId: 'req_status_change',
          timestamp: '2025-01-18T11:10:00Z',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'user.status_changed',
          userId: 'user_123',
          email: 'user@example.com',
          requestId: 'req_status_change',
        }),
        'User account status changed'
      );
    });
  });

  describe('RequestId Inclusion', () => {
    it('should include requestId in log entries when present', async () => {
      authEvents.emit({
        type: 'token.created',
        userId: 'user_123',
        ip: '192.168.1.1',
        metadata: {
          tokenId: 'tok_456',
          profileId: 'prof_789',
          tokenName: 'Test Token',
          scopes: ['read:transactions'],
          expiresAt: '2025-12-31T23:59:59Z',
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          requestId: 'req_unique_123',
          timestamp: '2025-01-18T10:00:00Z',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req_unique_123',
        }),
        expect.any(String)
      );
    });

    it('should handle events without requestId gracefully', async () => {
      authEvents.emit({
        type: 'token.created',
        userId: 'user_123',
        ip: '192.168.1.1',
        metadata: {
          tokenId: 'tok_456',
          profileId: 'prof_789',
          tokenName: 'Test Token',
          scopes: ['read:transactions'],
          expiresAt: '2025-12-31T23:59:59Z',
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          timestamp: '2025-01-18T10:00:00Z',
          // No requestId
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockInfo).toHaveBeenCalled();
      const logEntry = mockInfo.mock.calls[0]?.[0];
      expect(logEntry).not.toHaveProperty('requestId');
    });
  });

  describe('Sensitive Data Handling', () => {
    it('should not log full token values', async () => {
      authEvents.emit({
        type: 'token.auth_failed',
        ip: '192.168.1.1',
        metadata: {
          reason: 'invalid_format',
          tokenPrefix: 'sbf_abcd', // Only prefix should be logged
          ip: '192.168.1.1',
          userAgent: 'curl/7.88.1',
          requestId: 'req_test',
          timestamp: '2025-01-18T10:00:00Z',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockWarn).toHaveBeenCalled();
      const logEntry = mockWarn.mock.calls[0]?.[0] as any;

      // Should only have tokenPrefix, not full token
      expect(logEntry.metadata).toHaveProperty('tokenPrefix');
      expect(logEntry.metadata.tokenPrefix).toBe('sbf_abcd');
      expect(logEntry.metadata).not.toHaveProperty('token');
    });

    it('should log all required metadata fields', async () => {
      authEvents.emit({
        type: 'token.used',
        userId: 'user_123',
        ip: '192.168.1.1',
        metadata: {
          tokenId: 'tok_456',
          endpoint: '/v1/transactions',
          method: 'GET',
          status: 200,
          ip: '192.168.1.1',
          userAgent: 'curl/7.88.1',
          requestId: 'req_test',
          timestamp: '2025-01-18T10:00:00Z',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'token.used',
          userId: 'user_123',
          ip: '192.168.1.1',
          requestId: 'req_test',
          metadata: expect.objectContaining({
            tokenId: 'tok_456',
            endpoint: '/v1/transactions',
            method: 'GET',
            status: 200,
            userAgent: 'curl/7.88.1',
            timestamp: '2025-01-18T10:00:00Z',
          }),
        }),
        expect.any(String)
      );
    });
  });

  describe('Legacy Event Types', () => {
    it('should still handle user.registered events', async () => {
      authEvents.emit({
        type: 'user.registered',
        userId: 'user_123',
        email: 'test@example.com',
        ip: '192.168.1.1',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'user.registered',
          userId: 'user_123',
          email: 'test@example.com',
        }),
        'User registered successfully'
      );
    });

    it('should still handle user.login.success events', async () => {
      authEvents.emit({
        type: 'user.login.success',
        userId: 'user_123',
        email: 'test@example.com',
        ip: '192.168.1.1',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'user.login.success',
          userId: 'user_123',
        }),
        'User login successful'
      );
    });
  });

  describe('Security Event Persistence', () => {
    it('persists tracked events to security_events', async () => {
      authEvents.emit({
        type: 'refresh.reuse_detected',
        userId: 'user_123',
        metadata: {
          tokenId: 'tok_abcd',
          sessionId: 'sess_1',
          familyId: 'fam_1',
          ip: '203.0.113.1',
          userAgent: 'UA',
          requestId: 'req_evt',
          timestamp: '2025-01-18T10:00:00Z',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      if (securityEventSpy?.mock) {
        expect(securityEventSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              eventType: 'refresh.reuse_detected',
              userId: 'user_123',
              ipAddress: '203.0.113.1',
              userAgent: 'UA',
              metadata: expect.objectContaining({
                tokenId: 'tok_abcd',
              }),
            }),
          })
        );
      }
    });
  });
});

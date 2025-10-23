/**
 * Tests for audit logging functionality
 * Verifies that all event types are emitted correctly,
 * sensitive data is redacted, and requestId is included
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { authEvents } from "@repo/auth";
import { logger } from "@repo/observability";
import { initializeAuditLogging } from "../audit-logger.js";

describe("Audit Logger", () => {
  let mockInfo: ReturnType<typeof vi.spyOn>;
  let mockWarn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Clear all event handlers before each test
    authEvents.clearHandlers();
    
    // Create fresh mocks for each test
    mockInfo = vi.spyOn(logger, "info");
    mockWarn = vi.spyOn(logger, "warn");
    
    // Initialize audit logging
    initializeAuditLogging();
  });

  afterEach(() => {
    // Clean up
    authEvents.clearHandlers();
    mockInfo.mockRestore();
    mockWarn.mockRestore();
  });

  describe("Event Type Handling", () => {
    it("should log token.created events", async () => {
      authEvents.emit({
        type: "token.created",
        userId: "user_123",
        ip: "192.168.1.1",
        metadata: {
          tokenId: "tok_456",
          profileId: "prof_789",
          tokenName: "Test Token",
          scopes: ["read:transactions"],
          expiresAt: "2025-12-31T23:59:59Z",
          ip: "192.168.1.1",
          userAgent: "Mozilla/5.0",
          requestId: "req_abc123",
          timestamp: "2025-01-18T10:00:00Z",
        },
      });

      // Wait for async event handler
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "token.created",
          userId: "user_123",
          requestId: "req_abc123",
          metadata: expect.objectContaining({
            tokenId: "tok_456",
            tokenName: "Test Token",
          }),
        }),
        "API token created"
      );
    });

    it("should log token.used events", async () => {
      authEvents.emit({
        type: "token.used",
        userId: "user_123",
        ip: "192.168.1.1",
        metadata: {
          tokenId: "tok_456",
          endpoint: "/v1/transactions",
          method: "GET",
          status: 200,
          ip: "192.168.1.1",
          userAgent: "curl/7.88.1",
          requestId: "req_xyz789",
          timestamp: "2025-01-18T10:05:00Z",
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "token.used",
          userId: "user_123",
          requestId: "req_xyz789",
          metadata: expect.objectContaining({
            endpoint: "/v1/transactions",
            method: "GET",
            status: 200,
          }),
        }),
        "API token used successfully"
      );
    });

    it("should log token.revoked events", async () => {
      authEvents.emit({
        type: "token.revoked",
        userId: "user_123",
        ip: "192.168.1.1",
        metadata: {
          tokenId: "tok_456",
          profileId: "prof_789",
          tokenName: "Test Token",
          ip: "192.168.1.1",
          userAgent: "Mozilla/5.0",
          requestId: "req_def456",
          timestamp: "2025-01-18T10:10:00Z",
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "token.revoked",
          userId: "user_123",
          requestId: "req_def456",
        }),
        "API token revoked"
      );
    });

    it("should log token.auth_failed events as warnings", async () => {
      authEvents.emit({
        type: "token.auth_failed",
        userId: "user_123",
        ip: "192.168.1.1",
        metadata: {
          reason: "expired",
          tokenId: "tok_456",
          expiresAt: "2025-01-01T00:00:00Z",
          ip: "192.168.1.1",
          userAgent: "curl/7.88.1",
          requestId: "req_ghi789",
          timestamp: "2025-01-18T10:15:00Z",
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "token.auth_failed",
          userId: "user_123",
          requestId: "req_ghi789",
          metadata: expect.objectContaining({
            reason: "expired",
          }),
        }),
        "API token authentication failed"
      );
    });

    it("should log token.scope_denied events as warnings", async () => {
      authEvents.emit({
        type: "token.scope_denied",
        userId: "user_123",
        ip: "192.168.1.1",
        metadata: {
          tokenId: "tok_456",
          endpoint: "/v1/transactions",
          method: "POST",
          requiredScope: "write:transactions",
          providedScopes: ["read:transactions"],
          ip: "192.168.1.1",
          userAgent: "curl/7.88.1",
          requestId: "req_jkl012",
          timestamp: "2025-01-18T10:20:00Z",
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "token.scope_denied",
          userId: "user_123",
          requestId: "req_jkl012",
          metadata: expect.objectContaining({
            requiredScope: "write:transactions",
            providedScopes: ["read:transactions"],
          }),
        }),
        "API token scope denied"
      );
    });
  });

  describe("RequestId Inclusion", () => {
    it("should include requestId in log entries when present", async () => {
      authEvents.emit({
        type: "token.created",
        userId: "user_123",
        ip: "192.168.1.1",
        metadata: {
          tokenId: "tok_456",
          profileId: "prof_789",
          tokenName: "Test Token",
          scopes: ["read:transactions"],
          expiresAt: "2025-12-31T23:59:59Z",
          ip: "192.168.1.1",
          userAgent: "Mozilla/5.0",
          requestId: "req_unique_123",
          timestamp: "2025-01-18T10:00:00Z",
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req_unique_123",
        }),
        expect.any(String)
      );
    });

    it("should handle events without requestId gracefully", async () => {
      authEvents.emit({
        type: "token.created",
        userId: "user_123",
        ip: "192.168.1.1",
        metadata: {
          tokenId: "tok_456",
          profileId: "prof_789",
          tokenName: "Test Token",
          scopes: ["read:transactions"],
          expiresAt: "2025-12-31T23:59:59Z",
          ip: "192.168.1.1",
          userAgent: "Mozilla/5.0",
          timestamp: "2025-01-18T10:00:00Z",
          // No requestId
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockInfo).toHaveBeenCalled();
      const logEntry = mockInfo.mock.calls[0]?.[0];
      expect(logEntry).not.toHaveProperty("requestId");
    });
  });

  describe("Sensitive Data Handling", () => {
    it("should not log full token values", async () => {
      authEvents.emit({
        type: "token.auth_failed",
        ip: "192.168.1.1",
        metadata: {
          reason: "invalid_format",
          tokenPrefix: "sbf_abcd", // Only prefix should be logged
          ip: "192.168.1.1",
          userAgent: "curl/7.88.1",
          requestId: "req_test",
          timestamp: "2025-01-18T10:00:00Z",
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockWarn).toHaveBeenCalled();
      const logEntry = mockWarn.mock.calls[0]?.[0] as any;
      
      // Should only have tokenPrefix, not full token
      expect(logEntry.metadata).toHaveProperty("tokenPrefix");
      expect(logEntry.metadata.tokenPrefix).toBe("sbf_abcd");
      expect(logEntry.metadata).not.toHaveProperty("token");
    });

    it("should log all required metadata fields", async () => {
      authEvents.emit({
        type: "token.used",
        userId: "user_123",
        ip: "192.168.1.1",
        metadata: {
          tokenId: "tok_456",
          endpoint: "/v1/transactions",
          method: "GET",
          status: 200,
          ip: "192.168.1.1",
          userAgent: "curl/7.88.1",
          requestId: "req_test",
          timestamp: "2025-01-18T10:00:00Z",
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "token.used",
          userId: "user_123",
          ip: "192.168.1.1",
          requestId: "req_test",
          metadata: expect.objectContaining({
            tokenId: "tok_456",
            endpoint: "/v1/transactions",
            method: "GET",
            status: 200,
            userAgent: "curl/7.88.1",
            timestamp: "2025-01-18T10:00:00Z",
          }),
        }),
        expect.any(String)
      );
    });
  });

  describe("Legacy Event Types", () => {
    it("should still handle user.registered events", async () => {
      authEvents.emit({
        type: "user.registered",
        userId: "user_123",
        email: "test@example.com",
        ip: "192.168.1.1",
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "user.registered",
          userId: "user_123",
          email: "test@example.com",
        }),
        "User registered successfully"
      );
    });

    it("should still handle user.login.success events", async () => {
      authEvents.emit({
        type: "user.login.success",
        userId: "user_123",
        email: "test@example.com",
        ip: "192.168.1.1",
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "user.login.success",
          userId: "user_123",
        }),
        "User login successful"
      );
    });
  });
});

/**
 * Token Service Unit Tests
 *
 * Tests business logic with mocked repository
 * No database access - pure unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokenService } from '../token-service.js';
import type { TokenRepository } from '../token-repository.js';
import {
  DuplicateTokenNameError,
  InvalidScopesError,
  InvalidExpirationError,
  TokenNotFoundError,
} from '../token-errors.js';

describe('TokenService', () => {
  let tokenService: TokenService;
  let mockTokenRepo: TokenRepository;
  let mockAuthEvents: any;

  beforeEach(() => {
    // Mock repository
    mockTokenRepo = {
      existsByUserAndName: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      findActiveByUserId: vi.fn(),
      update: vi.fn(),
      revoke: vi.fn(),
    } as any;

    // Mock auth events
    mockAuthEvents = {
      emit: vi.fn(),
    };

    tokenService = new TokenService(mockTokenRepo, mockAuthEvents);
  });

  describe('createToken', () => {
    it('should create token successfully', async () => {
      // Arrange
      const params = {
        userId: 'user-123',
        name: 'My Token',
        scopes: ['read:transactions'],
        expiresInDays: 30,
        requestContext: {
          ip: '127.0.0.1',
          userAgent: 'test-agent',
          requestId: 'req-123',
        },
      };

      mockTokenRepo.existsByUserAndName = vi.fn().mockResolvedValue(false);
      mockTokenRepo.create = vi.fn().mockResolvedValue({
        id: 'token-123',
        userId: 'user-123',
        name: 'My Token',
        keyHash: hashToken('hash123'),
        last4: 'abcd',
        scopes: ['read:transactions'],
        createdAt: new Date('2024-01-01'),
        lastUsedAt: null,
        expiresAt: new Date('2024-01-31'),
        revokedAt: null,
      });

      // Act
      const result = await tokenService.createToken(params);

      // Assert
      expect(result.token).toMatch(/^sbf_/);
      expect(result.token).toMatch(/^sbf_[0-9a-fA-F-]{36}\.[A-Za-z0-9_-]{43}$/);
      expect(result.apiKey.name).toBe('My Token');
      expect(result.apiKey.scopes).toEqual(['read:transactions']);
      expect(result.apiKey.maskedToken).toBe('sbf_****abcd');
      expect(mockTokenRepo.existsByUserAndName).toHaveBeenCalledWith('user-123', 'My Token');
      expect(mockAuthEvents.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'token.created',
          userId: 'user-123',
          metadata: expect.objectContaining({
            tokenId: 'token-123',
            tokenName: 'My Token',
            scopes: ['read:transactions'],
          }),
        })
      );
    });

    it('should throw DuplicateTokenNameError if name exists', async () => {
      // Arrange
      const params = {
        userId: 'user-123',
        name: 'Duplicate',
        scopes: ['read:transactions'],
        expiresInDays: 30,
      };

      mockTokenRepo.existsByUserAndName = vi.fn().mockResolvedValue(true);

      // Act & Assert
      await expect(tokenService.createToken(params)).rejects.toThrow(DuplicateTokenNameError);
      await expect(tokenService.createToken(params)).rejects.toThrow(
        'Token name "Duplicate" already exists'
      );
    });

    it('should throw InvalidScopesError if scopes invalid', async () => {
      // Arrange
      const params = {
        userId: 'user-123',
        name: 'My Token',
        scopes: ['invalid:scope'],
        expiresInDays: 30,
      };

      // Act & Assert
      await expect(tokenService.createToken(params)).rejects.toThrow(InvalidScopesError);
    });

    it('should throw InvalidExpirationError if expiration < 1 day', async () => {
      // Arrange
      const params = {
        userId: 'user-123',
        name: 'My Token',
        scopes: ['read:transactions'],
        expiresInDays: 0,
      };

      // Act & Assert
      await expect(tokenService.createToken(params)).rejects.toThrow(InvalidExpirationError);
      await expect(tokenService.createToken(params)).rejects.toThrow(
        'Expiration must be between 1-365 days, got 0'
      );
    });

    it('should throw InvalidExpirationError if expiration > 365 days', async () => {
      // Arrange
      const params = {
        userId: 'user-123',
        name: 'My Token',
        scopes: ['read:transactions'],
        expiresInDays: 366,
      };

      // Act & Assert
      await expect(tokenService.createToken(params)).rejects.toThrow(InvalidExpirationError);
      await expect(tokenService.createToken(params)).rejects.toThrow(
        'Expiration must be between 1-365 days, got 366'
      );
    });
  });

  describe('listTokens', () => {
    it('should list all active tokens for user', async () => {
      // Arrange
      const params = { userId: 'user-123' };

      mockTokenRepo.findActiveByUserId = vi.fn().mockResolvedValue([
        {
          id: 'token-1',
          userId: 'user-123',
          name: 'Token 1',
          keyHash: hashToken('hash1'),
          last4: 'abc1',
          scopes: ['read:transactions'],
          createdAt: new Date('2024-01-01'),
          lastUsedAt: null,
          expiresAt: new Date('2024-01-31'),
          revokedAt: null,
        },
        {
          id: 'token-2',
          userId: 'user-123',
          name: 'Token 2',
          keyHash: hashToken('hash2'),
          last4: 'abc2',
          scopes: ['write:budgets'],
          createdAt: new Date('2024-01-02'),
          lastUsedAt: new Date('2024-01-15'),
          expiresAt: new Date('2024-02-01'),
          revokedAt: null,
        },
      ]);

      // Act
      const result = await tokenService.listTokens(params);

      // Assert
      expect(result).toHaveLength(2);
      const [first, second] = result;
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      expect(first!.name).toBe('Token 1');
      expect(first!.maskedToken).toBe('sbf_****abc1');
      expect(second!.name).toBe('Token 2');
      expect(second!.maskedToken).toBe('sbf_****abc2');
      expect(second!.lastUsedAt).toBe('2024-01-15T00:00:00.000Z');
    });

    it('should return empty array if no tokens', async () => {
      // Arrange
      const params = { userId: 'user-123' };
      mockTokenRepo.findActiveByUserId = vi.fn().mockResolvedValue([]);

      // Act
      const result = await tokenService.listTokens(params);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('updateToken', () => {
    it('should update token name successfully', async () => {
      // Arrange
      const params = {
        id: 'token-123',
        userId: 'user-123',
        name: 'Updated Name',
      };

      mockTokenRepo.findById = vi.fn().mockResolvedValue({
        id: 'token-123',
        userId: 'user-123',
        name: 'Old Name',
        keyHash: hashToken('hash123'),
        last4: 'abcd',
        scopes: ['read:transactions'],
        createdAt: new Date('2024-01-01'),
        lastUsedAt: null,
        expiresAt: new Date('2024-01-31'),
        revokedAt: null,
      });

      mockTokenRepo.existsByUserAndName = vi.fn().mockResolvedValue(false);

      mockTokenRepo.update = vi.fn().mockResolvedValue({
        id: 'token-123',
        userId: 'user-123',
        name: 'Updated Name',
        keyHash: hashToken('hash123'),
        last4: 'abcd',
        scopes: ['read:transactions'],
        createdAt: new Date('2024-01-01'),
        lastUsedAt: null,
        expiresAt: new Date('2024-01-31'),
        revokedAt: null,
      });

      // Act
      const result = await tokenService.updateToken(params);

      // Assert
      expect(result.name).toBe('Updated Name');
      expect(mockTokenRepo.update).toHaveBeenCalledWith('token-123', {
        name: 'Updated Name',
      });
    });

    it('should throw TokenNotFoundError if token not found', async () => {
      // Arrange
      const params = {
        id: 'token-123',
        userId: 'user-123',
        name: 'Updated Name',
      };

      mockTokenRepo.findById = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(tokenService.updateToken(params)).rejects.toThrow(TokenNotFoundError);
    });

    it('should throw TokenNotFoundError if token belongs to different user', async () => {
      // Arrange
      const params = {
        id: 'token-123',
        userId: 'user-123',
        name: 'Updated Name',
      };

      mockTokenRepo.findById = vi.fn().mockResolvedValue({
        id: 'token-123',
        userId: 'user-456', // Different user
        name: 'Old Name',
        keyHash: hashToken('hash123'),
        last4: 'abcd',
        scopes: ['read:transactions'],
        createdAt: new Date('2024-01-01'),
        lastUsedAt: null,
        expiresAt: new Date('2024-01-31'),
        revokedAt: null,
      });

      // Act & Assert
      await expect(tokenService.updateToken(params)).rejects.toThrow(TokenNotFoundError);
    });

    it('should throw TokenNotFoundError if token is revoked', async () => {
      // Arrange
      const params = {
        id: 'token-123',
        userId: 'user-123',
        name: 'Updated Name',
      };

      mockTokenRepo.findById = vi.fn().mockResolvedValue({
        id: 'token-123',
        userId: 'user-123',
        name: 'Old Name',
        keyHash: hashToken('hash123'),
        last4: 'abcd',
        scopes: ['read:transactions'],
        createdAt: new Date('2024-01-01'),
        lastUsedAt: null,
        expiresAt: new Date('2024-01-31'),
        revokedAt: new Date('2024-01-15'), // Revoked
      });

      // Act & Assert
      await expect(tokenService.updateToken(params)).rejects.toThrow(TokenNotFoundError);
    });

    it('should throw DuplicateTokenNameError if new name exists', async () => {
      // Arrange
      const params = {
        id: 'token-123',
        userId: 'user-123',
        name: 'Duplicate Name',
      };

      mockTokenRepo.findById = vi
        .fn()
        .mockResolvedValueOnce({
          id: 'token-123',
          userId: 'user-123',
          name: 'Old Name',
          keyHash: hashToken('hash123'),
          last4: 'abcd',
          scopes: ['read:transactions'],
          createdAt: new Date('2024-01-01'),
          lastUsedAt: null,
          expiresAt: new Date('2024-01-31'),
          revokedAt: null,
        })
        .mockResolvedValueOnce({
          id: 'token-123',
          userId: 'user-123',
          name: 'Old Name', // Different from new name
          keyHash: hashToken('hash123'),
          last4: 'abcd',
          scopes: ['read:transactions'],
          createdAt: new Date('2024-01-01'),
          lastUsedAt: null,
          expiresAt: new Date('2024-01-31'),
          revokedAt: null,
        });

      mockTokenRepo.existsByUserAndName = vi.fn().mockResolvedValue(true);

      // Act & Assert
      await expect(tokenService.updateToken(params)).rejects.toThrow(DuplicateTokenNameError);
    });
  });

  describe('revokeToken', () => {
    it('should revoke token successfully', async () => {
      // Arrange
      const params = {
        id: 'token-123',
        userId: 'user-123',
        requestContext: {
          ip: '127.0.0.1',
          userAgent: 'test-agent',
          requestId: 'req-123',
        },
      };

      mockTokenRepo.findById = vi.fn().mockResolvedValue({
        id: 'token-123',
        userId: 'user-123',
        name: 'My Token',
        keyHash: hashToken('hash123'),
        last4: 'abcd',
        scopes: ['read:transactions'],
        createdAt: new Date('2024-01-01'),
        lastUsedAt: null,
        expiresAt: new Date('2024-01-31'),
        revokedAt: null, // Not revoked yet
      });

      mockTokenRepo.revoke = vi.fn().mockResolvedValue(undefined);

      // Act
      await tokenService.revokeToken(params);

      // Assert
      expect(mockTokenRepo.revoke).toHaveBeenCalledWith('token-123');
      expect(mockAuthEvents.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'token.revoked',
          userId: 'user-123',
          metadata: expect.objectContaining({
            tokenId: 'token-123',
            tokenName: 'My Token',
          }),
        })
      );
    });

    it('should be idempotent (already revoked)', async () => {
      // Arrange
      const params = {
        id: 'token-123',
        userId: 'user-123',
      };

      mockTokenRepo.findById = vi.fn().mockResolvedValue({
        id: 'token-123',
        userId: 'user-123',
        name: 'My Token',
        keyHash: hashToken('hash123'),
        last4: 'abcd',
        scopes: ['read:transactions'],
        createdAt: new Date('2024-01-01'),
        lastUsedAt: null,
        expiresAt: new Date('2024-01-31'),
        revokedAt: new Date('2024-01-15'), // Already revoked
      });

      // Act
      await tokenService.revokeToken(params);

      // Assert
      expect(mockTokenRepo.revoke).not.toHaveBeenCalled();
      expect(mockAuthEvents.emit).not.toHaveBeenCalled();
    });

    it('should throw TokenNotFoundError if token not found', async () => {
      // Arrange
      const params = {
        id: 'token-123',
        userId: 'user-123',
      };

      mockTokenRepo.findById = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(tokenService.revokeToken(params)).rejects.toThrow(TokenNotFoundError);
    });

    it('should throw TokenNotFoundError if token belongs to different user', async () => {
      // Arrange
      const params = {
        id: 'token-123',
        userId: 'user-123',
      };

      mockTokenRepo.findById = vi.fn().mockResolvedValue({
        id: 'token-123',
        userId: 'user-456', // Different user
        name: 'My Token',
        keyHash: hashToken('hash123'),
        last4: 'abcd',
        scopes: ['read:transactions'],
        createdAt: new Date('2024-01-01'),
        lastUsedAt: null,
        expiresAt: new Date('2024-01-31'),
        revokedAt: null,
      });

      // Act & Assert
      await expect(tokenService.revokeToken(params)).rejects.toThrow(TokenNotFoundError);
    });
  });
});
import { hashToken } from '@repo/auth';

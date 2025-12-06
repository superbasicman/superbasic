import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VerificationService } from '../verification-service.js';
import { VerificationRepository } from '../verification-repository.js';
import {
  TokenExpiredError,
  TokenInvalidError,
  TokenAlreadyConsumedError,
  EmailAlreadyVerifiedError,
  UserNotFoundForVerificationError,
} from '../verification-errors.js';

// Mock @repo/auth
vi.mock('@repo/auth', () => ({
  createOpaqueToken: vi.fn(() => ({
    tokenId: 'mock-token-id',
    tokenSecret: 'mock-token-secret',
    value: 'ev_mock-token-id.mock-token-secret',
    prefix: 'ev',
  })),
  createTokenHashEnvelope: vi.fn(() => ({
    algo: 'hmac-sha256',
    keyId: 'v1',
    hash: 'mock-hash',
    issuedAt: new Date().toISOString(),
    salt: 'mock-salt',
  })),
  parseOpaqueToken: vi.fn((token: string) => {
    if (token.startsWith('ev_')) {
      const parts = token.replace('ev_', '').split('.');
      return {
        tokenId: parts[0],
        tokenSecret: parts[1],
        prefix: 'ev',
      };
    }
    return null;
  }),
  verifyTokenSecret: vi.fn(() => true),
}));

describe('VerificationService', () => {
  let service: VerificationService;
  let mockVerificationRepo: VerificationRepository;
  let mockPrisma: any;
  let mockAuthEvents: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockVerificationRepo = {
      create: vi.fn().mockResolvedValue({
        id: 'verification-id',
        identifier: 'test@example.com',
        tokenId: 'mock-token-id',
        type: 'email_verification',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        consumedAt: null,
      }),
      findByTokenId: vi.fn(),
      findValidByEmail: vi.fn(),
      markConsumed: vi.fn(),
      invalidateAllForEmail: vi.fn(),
    } as unknown as VerificationRepository;

    mockPrisma = {
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      verificationToken: {
        update: vi.fn(),
      },
      $transaction: vi.fn((callback: Function) => callback(mockPrisma)),
    };

    mockAuthEvents = {
      emit: vi.fn(),
    };

    service = new VerificationService(
      mockPrisma,
      mockVerificationRepo,
      mockAuthEvents
    );
  });

  describe('createEmailVerificationToken', () => {
    it('should create a verification token with ev_ prefix', async () => {
      const result = await service.createEmailVerificationToken({
        email: 'test@example.com',
        type: 'email_verification',
      });

      expect(result.tokenValue).toBe('ev_mock-token-id.mock-token-secret');
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(mockVerificationRepo.create).toHaveBeenCalledWith({
        identifier: 'test@example.com',
        tokenId: 'mock-token-id',
        hashEnvelope: expect.any(Object),
        type: 'email_verification',
        expiresAt: expect.any(Date),
      });
    });

    it('should normalize email to lowercase', async () => {
      await service.createEmailVerificationToken({
        email: 'TEST@EXAMPLE.COM',
        type: 'email_verification',
      });

      expect(mockVerificationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: 'test@example.com',
        })
      );
    });

    it('should emit verification.token_created event', async () => {
      await service.createEmailVerificationToken({
        email: 'test@example.com',
        type: 'email_verification',
      });

      expect(mockAuthEvents.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'verification.token_created',
          email: 'test@example.com',
          tokenType: 'email_verification',
        })
      );
    });
  });

  describe('verifyEmailToken', () => {
    it('should verify a valid token and mark user as verified', async () => {
      const mockTokenRecord = {
        id: 'verification-id',
        identifier: 'test@example.com',
        tokenId: 'mock-token-id',
        hashEnvelope: { hash: 'mock-hash' },
        type: 'email_verification',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        consumedAt: null,
      };

      const mockUser = {
        id: 'user-id',
        primaryEmail: 'test@example.com',
        emailVerified: false,
      };

      (mockVerificationRepo.findByTokenId as any).mockResolvedValue(
        mockTokenRecord
      );
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.verifyEmailToken({
        token: 'ev_mock-token-id.mock-token-secret',
      });

      expect(result.userId).toBe('user-id');
      expect(result.email).toBe('test@example.com');
      expect(mockAuthEvents.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'verification.email_verified',
          userId: 'user-id',
          email: 'test@example.com',
        })
      );
    });

    it('should throw TokenInvalidError for invalid token format', async () => {
      await expect(
        service.verifyEmailToken({ token: 'invalid-token' })
      ).rejects.toThrow(TokenInvalidError);
    });

    it('should throw TokenInvalidError for non-existent token', async () => {
      (mockVerificationRepo.findByTokenId as any).mockResolvedValue(null);

      await expect(
        service.verifyEmailToken({ token: 'ev_nonexistent.secret' })
      ).rejects.toThrow(TokenInvalidError);
    });

    it('should throw TokenAlreadyConsumedError for used token', async () => {
      const mockTokenRecord = {
        id: 'verification-id',
        identifier: 'test@example.com',
        tokenId: 'mock-token-id',
        hashEnvelope: { hash: 'mock-hash' },
        type: 'email_verification',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        consumedAt: new Date(),
      };

      (mockVerificationRepo.findByTokenId as any).mockResolvedValue(
        mockTokenRecord
      );

      await expect(
        service.verifyEmailToken({ token: 'ev_mock-token-id.mock-token-secret' })
      ).rejects.toThrow(TokenAlreadyConsumedError);
    });

    it('should throw TokenExpiredError for expired token', async () => {
      const mockTokenRecord = {
        id: 'verification-id',
        identifier: 'test@example.com',
        tokenId: 'mock-token-id',
        hashEnvelope: { hash: 'mock-hash' },
        type: 'email_verification',
        expiresAt: new Date(Date.now() - 1000), // Expired
        consumedAt: null,
      };

      (mockVerificationRepo.findByTokenId as any).mockResolvedValue(
        mockTokenRecord
      );

      await expect(
        service.verifyEmailToken({ token: 'ev_mock-token-id.mock-token-secret' })
      ).rejects.toThrow(TokenExpiredError);
    });

    it('should throw UserNotFoundForVerificationError if user not found', async () => {
      const mockTokenRecord = {
        id: 'verification-id',
        identifier: 'test@example.com',
        tokenId: 'mock-token-id',
        hashEnvelope: { hash: 'mock-hash' },
        type: 'email_verification',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        consumedAt: null,
      };

      (mockVerificationRepo.findByTokenId as any).mockResolvedValue(
        mockTokenRecord
      );
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyEmailToken({ token: 'ev_mock-token-id.mock-token-secret' })
      ).rejects.toThrow(UserNotFoundForVerificationError);
    });

    it('should throw EmailAlreadyVerifiedError if email already verified', async () => {
      const mockTokenRecord = {
        id: 'verification-id',
        identifier: 'test@example.com',
        tokenId: 'mock-token-id',
        hashEnvelope: { hash: 'mock-hash' },
        type: 'email_verification',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        consumedAt: null,
      };

      const mockUser = {
        id: 'user-id',
        primaryEmail: 'test@example.com',
        emailVerified: true, // Already verified
      };

      (mockVerificationRepo.findByTokenId as any).mockResolvedValue(
        mockTokenRecord
      );
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);

      await expect(
        service.verifyEmailToken({ token: 'ev_mock-token-id.mock-token-secret' })
      ).rejects.toThrow(EmailAlreadyVerifiedError);
    });
  });

  describe('resendVerificationEmail', () => {
    it('should return null if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const result = await service.resendVerificationEmail({
        email: 'nonexistent@example.com',
      });

      expect(result).toBeNull();
    });

    it('should return null if email already verified', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-id',
        primaryEmail: 'test@example.com',
        emailVerified: true,
      });

      const result = await service.resendVerificationEmail({
        email: 'test@example.com',
      });

      expect(result).toBeNull();
    });

    it('should invalidate old tokens and create new one', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-id',
        primaryEmail: 'test@example.com',
        emailVerified: false,
      });

      const result = await service.resendVerificationEmail({
        email: 'test@example.com',
      });

      expect(mockVerificationRepo.invalidateAllForEmail).toHaveBeenCalledWith(
        'test@example.com',
        'email_verification'
      );
      expect(result?.tokenValue).toBe('ev_mock-token-id.mock-token-secret');
    });
  });
});

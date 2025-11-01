/**
 * User Service Tests
 * 
 * Unit tests for user service with mocked repository.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from '../user-service.js';
import type { UserRepository } from '../user-repository.js';
import {
  DuplicateEmailError,
  InvalidEmailError,
  WeakPasswordError,
} from '../user-errors.js';

// Mock the hashPassword function
vi.mock('@repo/auth', async () => {
  const actual = await vi.importActual('@repo/auth');
  return {
    ...actual,
    hashPassword: vi.fn((password: string) => Promise.resolve(`hashed_${password}`)),
  };
});

describe('UserService', () => {
  let userService: UserService;
  let mockUserRepo: UserRepository;
  let mockAuthEvents: { emit: any };

  beforeEach(() => {
    // Mock repository
    mockUserRepo = {
      findByEmail: vi.fn(),
      create: vi.fn(),
      createWithProfile: vi.fn(),
    } as any;

    // Mock auth events
    mockAuthEvents = {
      emit: vi.fn(),
    };

    userService = new UserService(mockUserRepo, mockAuthEvents);
  });

  describe('registerUser', () => {
    it('should register user successfully with valid data', async () => {
      // Arrange
      const params = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        ip: '127.0.0.1',
      };

      mockUserRepo.findByEmail = vi.fn().mockResolvedValue(null);
      mockUserRepo.createWithProfile = vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date('2025-01-01T00:00:00Z'),
      });

      // Act
      const result = await userService.registerUser(params);

      // Assert
      expect(result).toEqual({
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      });

      expect(mockUserRepo.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockUserRepo.createWithProfile).toHaveBeenCalledWith(
        {
          email: 'test@example.com',
          password: 'hashed_password123',
          name: 'Test User',
        },
        expect.objectContaining({
          timezone: 'UTC',
          currency: 'USD',
        })
      );
      expect(mockAuthEvents.emit).toHaveBeenCalledWith({
        type: 'user.registered',
        userId: 'user-123',
        email: 'test@example.com',
        ip: '127.0.0.1',
      });
    });

    it('should normalize email to lowercase', async () => {
      // Arrange
      const params = {
        email: 'TEST@EXAMPLE.COM',
        password: 'password123',
      };

      mockUserRepo.findByEmail = vi.fn().mockResolvedValue(null);
      mockUserRepo.createWithProfile = vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: null,
        createdAt: new Date(),
      });

      // Act
      await userService.registerUser(params);

      // Assert
      expect(mockUserRepo.findByEmail).toHaveBeenCalledWith('test@example.com');
    });

    it('should trim whitespace from email', async () => {
      // Arrange
      const params = {
        email: '  test@example.com  ',
        password: 'password123',
      };

      mockUserRepo.findByEmail = vi.fn().mockResolvedValue(null);
      mockUserRepo.createWithProfile = vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: null,
        createdAt: new Date(),
      });

      // Act
      await userService.registerUser(params);

      // Assert
      expect(mockUserRepo.findByEmail).toHaveBeenCalledWith('test@example.com');
    });

    it('should handle optional name parameter', async () => {
      // Arrange
      const params = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockUserRepo.findByEmail = vi.fn().mockResolvedValue(null);
      mockUserRepo.createWithProfile = vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: null,
        createdAt: new Date(),
      });

      // Act
      const result = await userService.registerUser(params);

      // Assert
      expect(result.user.name).toBeNull();
      expect(mockUserRepo.createWithProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          name: null,
        }),
        expect.any(Object)
      );
    });

    it('should emit event without IP if not provided', async () => {
      // Arrange
      const params = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockUserRepo.findByEmail = vi.fn().mockResolvedValue(null);
      mockUserRepo.createWithProfile = vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: null,
        createdAt: new Date(),
      });

      // Act
      await userService.registerUser(params);

      // Assert
      expect(mockAuthEvents.emit).toHaveBeenCalledWith({
        type: 'user.registered',
        userId: 'user-123',
        email: 'test@example.com',
      });
    });

    it('should throw DuplicateEmailError if email exists', async () => {
      // Arrange
      const params = {
        email: 'existing@example.com',
        password: 'password123',
      };

      mockUserRepo.findByEmail = vi.fn().mockResolvedValue({
        id: 'existing-user',
        email: 'existing@example.com',
        name: null,
        createdAt: new Date(),
      } as any);

      // Act & Assert
      await expect(userService.registerUser(params)).rejects.toThrow(
        DuplicateEmailError
      );
      await expect(userService.registerUser(params)).rejects.toThrow(
        'Email already in use: existing@example.com'
      );
    });

    it('should throw InvalidEmailError for invalid email format', async () => {
      // Arrange
      const params = {
        email: 'invalid-email',
        password: 'password123',
      };

      // Act & Assert
      await expect(userService.registerUser(params)).rejects.toThrow(
        InvalidEmailError
      );
      await expect(userService.registerUser(params)).rejects.toThrow(
        'Invalid email format: invalid-email'
      );
    });

    it('should throw InvalidEmailError for email without domain', async () => {
      // Arrange
      const params = {
        email: 'test@',
        password: 'password123',
      };

      // Act & Assert
      await expect(userService.registerUser(params)).rejects.toThrow(
        InvalidEmailError
      );
    });

    it('should throw WeakPasswordError if password is too short', async () => {
      // Arrange
      const params = {
        email: 'test@example.com',
        password: 'short1',
      };

      // Act & Assert
      await expect(userService.registerUser(params)).rejects.toThrow(
        WeakPasswordError
      );
      await expect(userService.registerUser(params)).rejects.toThrow(
        'must be at least 8 characters'
      );
    });

    it('should throw WeakPasswordError if password has no letters', async () => {
      // Arrange
      const params = {
        email: 'test@example.com',
        password: '12345678',
      };

      // Act & Assert
      await expect(userService.registerUser(params)).rejects.toThrow(
        WeakPasswordError
      );
      await expect(userService.registerUser(params)).rejects.toThrow(
        'must contain at least one letter and one number'
      );
    });

    it('should throw WeakPasswordError if password has no numbers', async () => {
      // Arrange
      const params = {
        email: 'test@example.com',
        password: 'abcdefgh',
      };

      // Act & Assert
      await expect(userService.registerUser(params)).rejects.toThrow(
        WeakPasswordError
      );
      await expect(userService.registerUser(params)).rejects.toThrow(
        'must contain at least one letter and one number'
      );
    });

    it('should accept password with letters and numbers', async () => {
      // Arrange
      const params = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockUserRepo.findByEmail = vi.fn().mockResolvedValue(null);
      mockUserRepo.createWithProfile = vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: null,
        createdAt: new Date(),
      });

      // Act & Assert
      await expect(userService.registerUser(params)).resolves.toBeDefined();
    });
  });
});

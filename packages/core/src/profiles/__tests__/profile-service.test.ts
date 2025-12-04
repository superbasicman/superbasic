/**
 * Profile Service Unit Tests
 *
 * Tests profile service business logic with mocked Prisma client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProfileService } from '../profile-service.js';
import { ProfileNotFoundError, InvalidProfileDataError } from '../profile-errors.js';
import type { PrismaClient } from '@repo/database';

describe('ProfileService', () => {
  let profileService: ProfileService;
  let mockPrisma: any;

  beforeEach(() => {
    // Mock Prisma client
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      profile: {
        update: vi.fn(),
      },
    } as unknown as PrismaClient;

    profileService = new ProfileService(mockPrisma);
  });

  describe('getCurrentProfile', () => {
    it('should return profile successfully', async () => {
      // Arrange
      const mockUser = {
        id: 'user-123',
        primaryEmail: 'test@example.com',
        displayName: 'Test User',
        createdAt: new Date('2024-01-01'),
        profile: {
          id: 'profile-123',
          timezone: 'America/New_York',
          currency: 'USD',
        },
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await profileService.getCurrentProfile({ userId: 'user-123' });

      // Assert
      expect(result.user.id).toBe('user-123');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.name).toBe('Test User');
      expect(result.user.profile).toEqual({
        id: 'profile-123',
        timezone: 'America/New_York',
        currency: 'USD',
      });
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: {
          id: true,
          primaryEmail: true,
          displayName: true,
          createdAt: true,
          profile: {
            select: {
              id: true,
              timezone: true,
              currency: true,
            },
          },
        },
      });
    });

    it('should return profile with null profile data', async () => {
      // Arrange
      const mockUser = {
        id: 'user-123',
        primaryEmail: 'test@example.com',
        displayName: 'Test User',
        createdAt: new Date('2024-01-01'),
        profile: null,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await profileService.getCurrentProfile({ userId: 'user-123' });

      // Assert
      expect(result.user.profile).toBeNull();
    });

    it('should throw ProfileNotFoundError if user does not exist', async () => {
      // Arrange
      mockPrisma.user.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(profileService.getCurrentProfile({ userId: 'nonexistent' })).rejects.toThrow(
        ProfileNotFoundError
      );
    });
  });

  describe('updateProfile', () => {
    it('should update user name successfully', async () => {
      // Arrange
      const mockUpdatedUser = {
        id: 'user-123',
        primaryEmail: 'test@example.com',
        displayName: 'Updated Name',
        createdAt: new Date('2024-01-01'),
        profile: {
          id: 'profile-123',
          timezone: 'UTC',
          currency: 'USD',
        },
      };

      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue(mockUpdatedUser);

      // Act
      const result = await profileService.updateProfile({
        userId: 'user-123',
        profileId: 'profile-123',
        name: 'Updated Name',
      });

      // Assert
      expect(result.user.name).toBe('Updated Name');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { displayName: 'Updated Name' },
      });
    });

    it('should update profile timezone and currency', async () => {
      // Arrange
      const mockUpdatedUser = {
        id: 'user-123',
        primaryEmail: 'test@example.com',
        displayName: 'Test User',
        createdAt: new Date('2024-01-01'),
        profile: {
          id: 'profile-123',
          timezone: 'Europe/London',
          currency: 'GBP',
        },
      };

      mockPrisma.profile.update.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue(mockUpdatedUser);

      // Act
      const result = await profileService.updateProfile({
        userId: 'user-123',
        profileId: 'profile-123',
        timezone: 'Europe/London',
        currency: 'GBP',
      });

      // Assert
      expect(result.user.profile?.timezone).toBe('Europe/London');
      expect(result.user.profile?.currency).toBe('GBP');
    });

    it('should update both user name and profile data', async () => {
      // Arrange
      const mockUpdatedUser = {
        id: 'user-123',
        primaryEmail: 'test@example.com',
        displayName: 'New Name',
        createdAt: new Date('2024-01-01'),
        profile: {
          id: 'profile-123',
          timezone: 'Asia/Tokyo',
          currency: 'JPY',
        },
      };

      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.profile.update.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue(mockUpdatedUser);

      // Act
      const result = await profileService.updateProfile({
        userId: 'user-123',
        profileId: 'profile-123',
        name: 'New Name',
        timezone: 'Asia/Tokyo',
        currency: 'JPY',
      });

      // Assert
      expect(result.user.name).toBe('New Name');
      expect(result.user.profile?.timezone).toBe('Asia/Tokyo');
      expect(result.user.profile?.currency).toBe('JPY');
      expect(mockPrisma.user.update).toHaveBeenCalled();
    });

    it('should throw InvalidProfileDataError for invalid name', async () => {
      // Act & Assert
      await expect(
        profileService.updateProfile({
          userId: 'user-123',
          profileId: 'profile-123',
          name: '', // Empty string is invalid
        })
      ).rejects.toThrow(InvalidProfileDataError);
    });

    it('should throw InvalidProfileDataError for invalid currency', async () => {
      // Act & Assert
      await expect(
        profileService.updateProfile({
          userId: 'user-123',
          profileId: 'profile-123',
          currency: 'US', // Must be 3 characters
        })
      ).rejects.toThrow(InvalidProfileDataError);
    });

    it('should throw InvalidProfileDataError for name too long', async () => {
      // Act & Assert
      await expect(
        profileService.updateProfile({
          userId: 'user-123',
          profileId: 'profile-123',
          name: 'a'.repeat(101), // Max 100 characters
        })
      ).rejects.toThrow(InvalidProfileDataError);
    });

    it('should throw ProfileNotFoundError if user not found after update', async () => {
      // Arrange
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        profileService.updateProfile({
          userId: 'user-123',
          profileId: 'profile-123',
          name: 'Test',
        })
      ).rejects.toThrow(ProfileNotFoundError);
    });

    it('should not update profile if profileId is missing', async () => {
      // Arrange
      const mockUpdatedUser = {
        id: 'user-123',
        primaryEmail: 'test@example.com',
        displayName: 'Test User',
        createdAt: new Date('2024-01-01'),
        profile: null,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUpdatedUser);

      // Act
      await profileService.updateProfile({
        userId: 'user-123',
        timezone: 'UTC',
        currency: 'USD',
      });

      // Assert
      expect(mockPrisma.profile.update).not.toHaveBeenCalled();
    });
  });
});

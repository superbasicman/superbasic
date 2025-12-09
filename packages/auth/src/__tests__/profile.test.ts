/**
 * Tests for profile management utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ensureProfileExists } from '../profile.js';
import { authService } from '@repo/auth-core';

// Mock authService to avoid hitting Prisma directly in unit tests
vi.mock('@repo/auth-core', () => ({
  authService: {
    ensureProfileExists: vi.fn(),
  },
}));

describe('ensureProfileExists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return existing profile ID if profile exists', async () => {
    const userId = 'user-123';
    const profileId = 'profile-456';

    // Mock existing profile
    vi.mocked(authService.ensureProfileExists).mockResolvedValue(profileId);

    const result = await ensureProfileExists(userId);

    expect(result).toBe(profileId);
    expect(authService.ensureProfileExists).toHaveBeenCalledWith(userId);
  });

  it('should create new profile if none exists', async () => {
    const userId = 'user-789';
    const newProfileId = 'profile-new-123';

    vi.mocked(authService.ensureProfileExists).mockResolvedValue(newProfileId);

    const result = await ensureProfileExists(userId);

    expect(result).toBe(newProfileId);
    expect(authService.ensureProfileExists).toHaveBeenCalledWith(userId);
  });

  it('should be idempotent - safe to call multiple times', async () => {
    const userId = 'user-idempotent';
    const profileId = 'profile-same';

    // Mock existing profile on all calls
    vi.mocked(authService.ensureProfileExists).mockResolvedValue(profileId);

    // Call multiple times
    const result1 = await ensureProfileExists(userId);
    const result2 = await ensureProfileExists(userId);
    const result3 = await ensureProfileExists(userId);

    // Should return same profile ID each time
    expect(result1).toBe(profileId);
    expect(result2).toBe(profileId);
    expect(result3).toBe(profileId);

    // Should only check for existing profile, never create
    expect(authService.ensureProfileExists).toHaveBeenCalledTimes(3);
  });
});

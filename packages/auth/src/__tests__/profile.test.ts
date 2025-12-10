/**
 * Tests for profile management utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockEnsureProfileExists } = vi.hoisted(() => {
  return { mockEnsureProfileExists: vi.fn() };
});

vi.mock('@repo/auth-core', () => ({
  createAuthService: vi.fn(() => Promise.resolve({
    ensureProfileExists: mockEnsureProfileExists,
  })),
}));

import { ensureProfileExists } from '../profile.js';

describe('ensureProfileExists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return existing profile ID if profile exists', async () => {
    const userId = 'user-123';
    const profileId = 'profile-456';

    // Mock existing profile
    mockEnsureProfileExists.mockResolvedValue(profileId);

    const result = await ensureProfileExists(userId);

    expect(result).toBe(profileId);
    expect(mockEnsureProfileExists).toHaveBeenCalledWith(userId);
  });

  it('should create new profile if none exists', async () => {
    const userId = 'user-789';
    const newProfileId = 'profile-new-123';

    mockEnsureProfileExists.mockResolvedValue(newProfileId);

    const result = await ensureProfileExists(userId);

    expect(result).toBe(newProfileId);
    expect(mockEnsureProfileExists).toHaveBeenCalledWith(userId);
  });

  it('should be idempotent - safe to call multiple times', async () => {
    const userId = 'user-idempotent';
    const profileId = 'profile-same';

    // Mock existing profile on all calls
    mockEnsureProfileExists.mockResolvedValue(profileId);

    // Call multiple times
    const result1 = await ensureProfileExists(userId);
    const result2 = await ensureProfileExists(userId);
    const result3 = await ensureProfileExists(userId);

    // Should return same profile ID each time
    expect(result1).toBe(profileId);
    expect(result2).toBe(profileId);
    expect(result3).toBe(profileId);

    // Should only check for existing profile, never create
    expect(mockEnsureProfileExists).toHaveBeenCalledTimes(3);
  });
});
/**
 * User Service
 *
 * Business logic layer for user operations.
 * Implements user registration with validation and profile creation.
 */

import type { UserRepository } from './user-repository.js';
import { hashPassword } from '@repo/auth';
import {
  DuplicateEmailError,
  InvalidEmailError,
  WeakPasswordError,
  UserNotFoundError,
} from './user-errors.js';
import type {
  RegisterUserParams,
  RegisterUserResult,
  CreateUserData,
  UserProfileData,
  UpdateUserStatusParams,
} from './user-types.js';
import type { UserState } from '@repo/database';

export class UserService {
  constructor(
    private userRepo: UserRepository,
    private authEvents: { emit: (event: any) => void }
  ) {}

  /**
   * Register a new user with profile
   *
   * Business rules:
   * - Email must be valid format
   * - Email must be unique (case-insensitive)
   * - Password must meet minimum requirements
   * - Profile created with default settings (UTC, USD)
   * - Emits user.registered event for audit logging
   */
  async registerUser(params: RegisterUserParams): Promise<RegisterUserResult> {
    // Normalize and validate email
    const normalizedEmail = this.normalizeEmail(params.email);
    this.validateEmail(normalizedEmail);

    // Validate password
    this.validatePassword(params.password);

    // Check for duplicate email
    const existing = await this.userRepo.findByEmail(normalizedEmail);
    if (existing) {
      throw new DuplicateEmailError(normalizedEmail);
    }

    // Hash password
    const hashedPassword = await hashPassword(params.password);

    // Prepare user data
    const userData: CreateUserData = {
      email: normalizedEmail,
      password: hashedPassword,
      name: params.name ?? null,
    };

    // Prepare profile data with defaults
    const profileData: UserProfileData = {
      userId: '', // Will be set by repository after user creation
      timezone: 'UTC',
      currency: 'USD',
    };

    // Create user with profile in transaction
    const user = await this.userRepo.createWithProfile(userData, {
      ...profileData,
      userId: '', // Repository handles this
    });

    // Emit registration event
    this.authEvents.emit({
      type: 'user.registered',
      userId: user.id,
      email: user.primaryEmail,
      ...(params.ip && { ip: params.ip }),
    });

    // Return user response
    return this.mapToUserResponse(user);
  }

  /**
   * Update a user's account status and emit audit event
   */
  async updateUserStatus(params: UpdateUserStatusParams): Promise<{ id: string; status: string }> {
    const existing = await this.userRepo.findById(params.userId);

    if (!existing) {
      throw new UserNotFoundError(params.userId);
    }

    if (existing.userState === params.status) {
      return { id: existing.id, status: existing.userState };
    }

    // Cast string status to UserState enum if needed, or assume params.status is valid UserState
    const updated = await this.userRepo.updateStatus(params.userId, params.status as UserState);

    if (!updated) {
      throw new UserNotFoundError(params.userId);
    }

    this.authEvents.emit({
      type: 'user.status_changed',
      userId: params.userId,
      email: existing.primaryEmail,
      metadata: {
        previousStatus: updated.previousStatus,
        newStatus: params.status,
        reason: params.reason ?? null,
        changedBy: params.changedBy ?? null,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
        requestId: params.requestId ?? null,
        timestamp: new Date().toISOString(),
      },
    });

    return { id: updated.user.id, status: updated.user.userState };
  }

  /**
   * Check if a user's email is verified
   * Returns false if user not found or email not verified
   */
  async isEmailVerified(userId: string): Promise<boolean> {
    const verified = await this.userRepo.getEmailVerifiedStatus(userId);
    return verified === true;
  }

  /**
   * Normalize email to lowercase and trim whitespace
   */
  private normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  /**
   * Validate email format
   * Basic validation - checks for @ symbol and domain
   */
  private validateEmail(email: string): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new InvalidEmailError(email);
    }
  }

  /**
   * Validate password meets minimum requirements
   * - At least 8 characters
   * - Contains at least one letter and one number
   */
  private validatePassword(password: string): void {
    if (password.length < 8) {
      throw new WeakPasswordError('must be at least 8 characters');
    }

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);

    if (!hasLetter || !hasNumber) {
      throw new WeakPasswordError('must contain at least one letter and one number');
    }
  }

  /**
   * Map database user to response format
   */
  private mapToUserResponse(user: {
    id: string;
    primaryEmail: string;
    displayName: string | null;
    createdAt: Date;
  }): RegisterUserResult {
    return {
      user: {
        id: user.id,
        email: user.primaryEmail,
        name: user.displayName,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }
}

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
} from './user-errors.js';
import type {
  RegisterUserParams,
  RegisterUserResult,
  CreateUserData,
  UserProfileData,
} from './user-types.js';

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
      email: user.email,
      ...(params.ip && { ip: params.ip }),
    });

    // Return user response
    return this.mapToUserResponse(user);
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
    email: string;
    name: string | null;
    createdAt: Date;
  }): RegisterUserResult {
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }
}

/**
 * User Domain Types
 * 
 * Type definitions for user service operations.
 */

export interface RegisterUserParams {
  email: string;
  password: string;
  name?: string;
  ip?: string; // For audit logging
}

export interface RegisterUserResult {
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
  };
}

export interface CreateUserData {
  email: string;
  password: string;
  name: string | null;
}

export interface UserProfileData {
  userId: string;
  timezone: string;
  currency: string;
}

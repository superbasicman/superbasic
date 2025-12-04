/**
 * Password hashing and verification utilities
 * Uses bcrypt for secure password storage
 */

import bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from './constants.js';

/**
 * Hash a password using bcrypt
 * @param password - Plain text password to hash
 * @returns Promise resolving to bcrypt hash
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Verify a password against a bcrypt hash
 * Uses constant-time comparison to prevent timing attacks
 * @param password - Plain text password to verify
 * @param hashedPassword - Bcrypt hash to compare against
 * @returns Promise resolving to true if password matches
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

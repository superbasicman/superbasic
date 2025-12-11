/**
 * Password hashing and verification utilities
 * Uses Node's built-in scrypt for secure password storage (no native addons needed)
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { BCRYPT_SALT_ROUNDS } from './constants.js';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

/**
 * Hash a password using scrypt
 * @param password - Plain text password to hash
 * @returns Promise resolving to hash string
 */
export async function hashPassword(password: string): Promise<string> {
  // Use BCRYPT_SALT_ROUNDS to derive salt cost parity (keep single source of truth)
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${BCRYPT_SALT_ROUNDS}$${salt.toString('base64')}$${derivedKey.toString('base64')}`;
}

/**
 * Verify a password against a scrypt hash
 * Uses constant-time comparison to prevent timing attacks
 * @param password - Plain text password to verify
 * @param hashedPassword - Stored hash string
 * @returns Promise resolving to true if password matches
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  const parts = hashedPassword.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, roundsStr, saltB64, keyB64] = parts as [string, string, string, string];
  if (!saltB64 || !keyB64) {
    return false;
  }

  const salt = Buffer.from(saltB64, 'base64');
  const storedKey = Buffer.from(keyB64, 'base64');
  const rounds = Number.parseInt(roundsStr, 10);
  if (!Number.isFinite(rounds)) {
    return false;
  }

  const derivedKey = (await scrypt(password, salt, storedKey.length)) as Buffer;
  return timingSafeEqual(storedKey, derivedKey);
}

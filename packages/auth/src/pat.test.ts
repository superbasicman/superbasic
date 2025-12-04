/**
 * Unit tests for Personal Access Token (PAT) utilities
 */

import { describe, it, expect } from 'vitest';
import {
  generateToken,
  hashToken,
  verifyToken,
  isValidTokenFormat,
  extractTokenFromHeader,
} from './pat.js';

describe('generateToken', () => {
  it('should generate a token with sbf_ prefix', () => {
    const token = generateToken();
    expect(token).toMatch(/^sbf_/);
  });

  it('should generate a token with correct format (sbf_<uuid>.<secret>)', () => {
    const token = generateToken();
    expect(token).toMatch(/^sbf_[0-9a-fA-F-]{36}\.[A-Za-z0-9_-]+$/);
  });

  it('should generate unique tokens', () => {
    const tokens = new Set<string>();
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      tokens.add(generateToken());
    }

    // All tokens should be unique
    expect(tokens.size).toBe(iterations);
  });

  it('should generate tokens with 256 bits of entropy in secret component', () => {
    const token = generateToken();
    const secret = token.split('.')[1];
    expect(secret).toHaveLength(43); // 32 bytes base64url encoded
  });
});

describe('hashToken', () => {
  it('should produce a token hash envelope with metadata', () => {
    const token = 'sbf_123e4567-e89b-12d3-a456-426614174000.secret';
    const hash = hashToken(token);

    expect(hash).toMatchObject({
      algo: 'hmac-sha256',
      keyId: expect.any(String),
      hash: expect.any(String),
      issuedAt: expect.any(String),
      salt: expect.any(String),
    });
  });

  it('should produce different hashes for different inputs', () => {
    const token1 = generateToken();
    const token2 = generateToken();
    const hash1 = hashToken(token1);
    const hash2 = hashToken(token2);
    
    expect(hash1.hash).not.toBe(hash2.hash);
  });

  it('should include unique salts for the same input', () => {
    const token = generateToken();
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);
    expect(hash1.hash).not.toBe(hash2.hash);
    expect(hash1.salt).not.toBe(hash2.salt);
  });
});

describe('verifyToken', () => {
  it('should verify a valid token against its hash', () => {
    const token = generateToken();
    const hash = hashToken(token);
    
    expect(verifyToken(token, hash)).toBe(true);
  });

  it('should reject an invalid token', () => {
    const token1 = generateToken();
    const token2 = generateToken();
    const hash1 = hashToken(token1);
    
    expect(verifyToken(token2, hash1)).toBe(false);
  });

  it('should reject a token with wrong hash', () => {
    const token = generateToken();
    const wrongHash = { ...hashToken(token), hash: 'invalid' };
    
    expect(verifyToken(token, wrongHash)).toBe(false);
  });

  it('should use constant-time comparison', () => {
    const token = generateToken();
    const hash = hashToken(token);
    
    // This test verifies the function doesn't throw
    // Actual timing attack resistance is hard to test in unit tests
    expect(() => verifyToken(token, hash)).not.toThrow();
  });

  it('should handle invalid hash format gracefully', () => {
    const token = generateToken();
    const invalidHash = { algo: 'hmac-sha256', keyId: 'v1', hash: 'invalid', issuedAt: new Date().toISOString() } as any;
    
    expect(verifyToken(token, invalidHash)).toBe(false);
  });

  it('should handle empty hash gracefully', () => {
    const token = generateToken();
    
    expect(verifyToken(token, undefined as any)).toBe(false);
  });
});

describe('isValidTokenFormat', () => {
  it('should accept valid token format', () => {
    const token = generateToken();
    expect(isValidTokenFormat(token)).toBe(true);
  });

  it('should reject token without sbf_ prefix', () => {
    const token = 'invalid_123e4567-e89b-12d3-a456-426614174000.secret';
    expect(isValidTokenFormat(token)).toBe(false);
  });

  it('should reject token with wrong length', () => {
    const token = 'sbf_123e4567-e89b-12d3-a456-426614174000.short';
    expect(isValidTokenFormat(token)).toBe(false);
  });

  it('should reject token with invalid characters', () => {
    const token = 'sbf_123e4567-e89b-12d3-a456-426614174000.secr!';
    expect(isValidTokenFormat(token)).toBe(false);
  });

  it('should reject token with padding characters', () => {
    const token = 'sbf_123e4567-e89b-12d3-a456-426614174000.secret=';
    expect(isValidTokenFormat(token)).toBe(false);
  });

  it('should accept tokens with valid base64url characters', () => {
    const secret = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789-'; // 43 chars
    expect(secret).toHaveLength(43);
    const token = `sbf_123e4567-e89b-12d3-a456-426614174000.${secret}`;
    expect(isValidTokenFormat(token)).toBe(true);
  });

  it('should reject empty string', () => {
    expect(isValidTokenFormat('')).toBe(false);
  });

  it('should reject null or undefined', () => {
    expect(isValidTokenFormat(null as any)).toBe(false);
    expect(isValidTokenFormat(undefined as any)).toBe(false);
  });
});

describe('extractTokenFromHeader', () => {
  it('should extract token from valid Bearer header', () => {
    const token = generateToken();
    const header = `Bearer ${token}`;
    
    expect(extractTokenFromHeader(header)).toBe(token);
  });

  it('should return null for missing header', () => {
    expect(extractTokenFromHeader(undefined)).toBe(null);
  });

  it('should return null for header without Bearer prefix', () => {
    const token = generateToken();
    expect(extractTokenFromHeader(token)).toBe(null);
  });

  it('should return null for malformed Bearer header', () => {
    expect(extractTokenFromHeader('Bearer')).toBe(null);
    expect(extractTokenFromHeader('Bearer  ')).toBe(null);
  });

  it('should return null for wrong auth scheme', () => {
    const token = generateToken();
    expect(extractTokenFromHeader(`Basic ${token}`)).toBe(null);
  });

  it('should handle extra spaces gracefully', () => {
    const token = generateToken();
    const header = `Bearer  ${token}`; // Extra space
    
    // Should return null because split(' ') will create more than 2 parts
    expect(extractTokenFromHeader(header)).toBe(null);
  });

  it('should return null for empty string', () => {
    expect(extractTokenFromHeader('')).toBe(null);
  });
});

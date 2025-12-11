import { describe, expect, it } from 'vitest';
import {
  VALID_SCOPES,
  hasAllScopes,
  hasAnyScope,
  hasScope,
  isValidScope,
  validateScopes,
} from '../rbac.js';
import type { Scope } from '../rbac.js';

describe('VALID_SCOPES', () => {
  it('should contain expected scopes', () => {
    const expectedScopes = [
      'admin',
      'read:transactions',
      'write:transactions',
      'read:accounts',
      'write:accounts',
      'read:profile',
      'write:profile',
      'read:workspaces',
      'write:workspaces',
    ];

    for (const scope of expectedScopes) {
      expect(VALID_SCOPES).toContain(scope);
    }
  });

  it('should include admin scope for full access', () => {
    expect(VALID_SCOPES).toContain('admin');
  });
});

describe('isValidScope', () => {
  it('should return true for valid scopes', () => {
    expect(isValidScope('read:transactions')).toBe(true);
  });

  it('should return false for invalid scopes', () => {
    expect(isValidScope('invalid:scope')).toBe(false);
  });
});

describe('validateScopes', () => {
  it('should validate an array of valid scopes', () => {
    const scopes: string[] = ['read:transactions', 'write:accounts'];
    expect(validateScopes(scopes)).toBe(true);
  });

  it('should return false for invalid scopes', () => {
    const scopes: string[] = ['read:transactions', 'invalid:scope'];
    expect(validateScopes(scopes)).toBe(false);
  });
});

describe('hasScope', () => {
  it('should return true when user has required scope', () => {
    const userScopes = ['read:transactions', 'write:accounts'];
    expect(hasScope(userScopes, 'read:transactions')).toBe(true);
  });

  it('should return false when user lacks required scope', () => {
    const userScopes = ['read:profile'];
    expect(hasScope(userScopes, 'write:transactions')).toBe(false);
  });

  it('should return true when user has admin scope', () => {
    const userScopes = ['admin'];
    expect(hasScope(userScopes, 'read:transactions')).toBe(true);
  });
});

describe('hasAllScopes', () => {
  it('should return true when user has all required scopes', () => {
    const userScopes: Scope[] = ['read:transactions', 'write:transactions'];
    const requiredScopes: Scope[] = ['read:transactions', 'write:transactions'];
    expect(hasAllScopes(userScopes, requiredScopes)).toBe(true);
  });

  it('should return false when user lacks one of the required scopes', () => {
    const userScopes: Scope[] = ['read:transactions'];
    const requiredScopes: Scope[] = ['read:transactions', 'write:transactions'];
    expect(hasAllScopes(userScopes, requiredScopes)).toBe(false);
  });

  it('should return true for admin scope', () => {
    const userScopes: Scope[] = ['admin'];
    const requiredScopes: Scope[] = ['read:transactions', 'write:transactions'];
    expect(hasAllScopes(userScopes, requiredScopes)).toBe(true);
  });
});

describe('hasAnyScope', () => {
  it('should return true when user has any of the required scopes', () => {
    const userScopes: Scope[] = ['read:transactions'];
    const requiredScopes: Scope[] = ['write:transactions', 'read:transactions'];
    expect(hasAnyScope(userScopes, requiredScopes)).toBe(true);
  });

  it('should return false when user lacks all required scopes', () => {
    const userScopes: Scope[] = ['read:profile'];
    const requiredScopes: Scope[] = ['write:transactions', 'write:accounts'];
    expect(hasAnyScope(userScopes, requiredScopes)).toBe(false);
  });

  it('should return true for admin scope', () => {
    const userScopes: Scope[] = ['admin'];
    const requiredScopes: Scope[] = ['write:transactions'];
    expect(hasAnyScope(userScopes, requiredScopes)).toBe(true);
  });
});

/**
 * Unit tests for RBAC scope validation utilities
 */

import { describe, it, expect } from 'vitest';
import {
  VALID_SCOPES,
  isValidScope,
  validateScopes,
  hasScope,
  hasAllScopes,
  hasAnyScope,
  type Scope,
} from './rbac.js';

describe('VALID_SCOPES', () => {
  it('should contain all required scopes', () => {
    const requiredScopes = [
      'read:transactions',
      'write:transactions',
      'read:budgets',
      'write:budgets',
      'read:accounts',
      'write:accounts',
      'read:profile',
      'write:profile',
    ];

    for (const scope of requiredScopes) {
      expect(VALID_SCOPES).toContain(scope);
    }
  });

  it('should contain admin scope', () => {
    expect(VALID_SCOPES).toContain('admin');
  });

  it('should be a readonly array', () => {
    // TypeScript enforces this at compile time
    // This test just verifies the array exists
    expect(Array.isArray(VALID_SCOPES)).toBe(true);
  });
});

describe('isValidScope', () => {
  it('should return true for valid scopes', () => {
    expect(isValidScope('read:transactions')).toBe(true);
    expect(isValidScope('write:transactions')).toBe(true);
    expect(isValidScope('read:budgets')).toBe(true);
    expect(isValidScope('write:budgets')).toBe(true);
    expect(isValidScope('read:accounts')).toBe(true);
    expect(isValidScope('write:accounts')).toBe(true);
    expect(isValidScope('read:profile')).toBe(true);
    expect(isValidScope('write:profile')).toBe(true);
    expect(isValidScope('admin')).toBe(true);
  });

  it('should return false for invalid scopes', () => {
    expect(isValidScope('invalid:scope')).toBe(false);
    expect(isValidScope('read:invalid')).toBe(false);
    expect(isValidScope('delete:transactions')).toBe(false);
    expect(isValidScope('')).toBe(false);
  });

  it('should be case-sensitive', () => {
    expect(isValidScope('READ:TRANSACTIONS')).toBe(false);
    expect(isValidScope('Read:Transactions')).toBe(false);
  });

  it('should handle special characters', () => {
    expect(isValidScope('read:transactions!')).toBe(false);
    expect(isValidScope('read:transactions ')).toBe(false);
  });
});

describe('validateScopes', () => {
  it('should return true for array of valid scopes', () => {
    const scopes = ['read:transactions', 'write:budgets', 'read:profile'];
    expect(validateScopes(scopes)).toBe(true);
  });

  it('should return false if any scope is invalid', () => {
    const scopes = ['read:transactions', 'invalid:scope', 'read:profile'];
    expect(validateScopes(scopes)).toBe(false);
  });

  it('should return true for empty array', () => {
    expect(validateScopes([])).toBe(true);
  });

  it('should return true for single valid scope', () => {
    expect(validateScopes(['admin'])).toBe(true);
  });

  it('should return false for single invalid scope', () => {
    expect(validateScopes(['invalid'])).toBe(false);
  });

  it('should handle duplicate scopes', () => {
    const scopes = ['read:transactions', 'read:transactions'];
    expect(validateScopes(scopes)).toBe(true);
  });
});

describe('hasScope', () => {
  it('should return true when user has the required scope', () => {
    const userScopes = ['read:transactions', 'write:budgets'];
    expect(hasScope(userScopes, 'read:transactions')).toBe(true);
  });

  it('should return false when user does not have the required scope', () => {
    const userScopes = ['read:transactions', 'write:budgets'];
    expect(hasScope(userScopes, 'write:transactions')).toBe(false);
  });

  it('should return true when user has admin scope', () => {
    const userScopes = ['admin'];
    expect(hasScope(userScopes, 'read:transactions')).toBe(true);
    expect(hasScope(userScopes, 'write:transactions')).toBe(true);
    expect(hasScope(userScopes, 'read:budgets')).toBe(true);
  });

  it('should return true when user has both admin and specific scope', () => {
    const userScopes = ['admin', 'read:transactions'];
    expect(hasScope(userScopes, 'read:transactions')).toBe(true);
  });

  it('should return false for empty user scopes', () => {
    const userScopes: string[] = [];
    expect(hasScope(userScopes, 'read:transactions')).toBe(false);
  });

  it('should handle case sensitivity', () => {
    const userScopes = ['READ:TRANSACTIONS'];
    expect(hasScope(userScopes, 'read:transactions')).toBe(false);
  });
});

describe('hasAllScopes', () => {
  it('should return true when user has all required scopes', () => {
    const userScopes = ['read:transactions', 'write:transactions', 'read:budgets'];
    const requiredScopes: Scope[] = ['read:transactions', 'write:transactions'];
    expect(hasAllScopes(userScopes, requiredScopes)).toBe(true);
  });

  it('should return false when user is missing one required scope', () => {
    const userScopes = ['read:transactions', 'read:budgets'];
    const requiredScopes: Scope[] = ['read:transactions', 'write:transactions'];
    expect(hasAllScopes(userScopes, requiredScopes)).toBe(false);
  });

  it('should return true when user has admin scope', () => {
    const userScopes = ['admin'];
    const requiredScopes: Scope[] = ['read:transactions', 'write:transactions', 'read:budgets'];
    expect(hasAllScopes(userScopes, requiredScopes)).toBe(true);
  });

  it('should return true for empty required scopes', () => {
    const userScopes = ['read:transactions'];
    const requiredScopes: Scope[] = [];
    expect(hasAllScopes(userScopes, requiredScopes)).toBe(true);
  });

  it('should return false when user has no scopes', () => {
    const userScopes: string[] = [];
    const requiredScopes: Scope[] = ['read:transactions'];
    expect(hasAllScopes(userScopes, requiredScopes)).toBe(false);
  });

  it('should handle duplicate required scopes', () => {
    const userScopes = ['read:transactions'];
    const requiredScopes: Scope[] = ['read:transactions', 'read:transactions'];
    expect(hasAllScopes(userScopes, requiredScopes)).toBe(true);
  });
});

describe('hasAnyScope', () => {
  it('should return true when user has at least one required scope', () => {
    const userScopes = ['read:transactions', 'read:budgets'];
    const requiredScopes: Scope[] = ['write:transactions', 'read:budgets'];
    expect(hasAnyScope(userScopes, requiredScopes)).toBe(true);
  });

  it('should return false when user has none of the required scopes', () => {
    const userScopes = ['read:transactions', 'read:budgets'];
    const requiredScopes: Scope[] = ['write:transactions', 'write:budgets'];
    expect(hasAnyScope(userScopes, requiredScopes)).toBe(false);
  });

  it('should return true when user has admin scope', () => {
    const userScopes = ['admin'];
    const requiredScopes: Scope[] = ['read:transactions', 'write:transactions'];
    expect(hasAnyScope(userScopes, requiredScopes)).toBe(true);
  });

  it('should return false for empty required scopes', () => {
    const userScopes = ['read:transactions'];
    const requiredScopes: Scope[] = [];
    expect(hasAnyScope(userScopes, requiredScopes)).toBe(false);
  });

  it('should return false when user has no scopes', () => {
    const userScopes: string[] = [];
    const requiredScopes: Scope[] = ['read:transactions'];
    expect(hasAnyScope(userScopes, requiredScopes)).toBe(false);
  });

  it('should return true when user has all required scopes', () => {
    const userScopes = ['read:transactions', 'write:transactions'];
    const requiredScopes: Scope[] = ['read:transactions', 'write:transactions'];
    expect(hasAnyScope(userScopes, requiredScopes)).toBe(true);
  });
});

describe('admin scope behavior', () => {
  it('should grant all permissions with admin scope', () => {
    const userScopes = ['admin'];

    // Test all valid scopes
    for (const scope of VALID_SCOPES) {
      if (scope !== 'admin') {
        expect(hasScope(userScopes, scope)).toBe(true);
      }
    }
  });

  it('should work with hasAllScopes', () => {
    const userScopes = ['admin'];
    const allScopes = VALID_SCOPES.filter((s) => s !== 'admin') as Scope[];

    expect(hasAllScopes(userScopes, allScopes)).toBe(true);
  });

  it('should work with hasAnyScope', () => {
    const userScopes = ['admin'];
    const someScopes: Scope[] = ['read:transactions', 'write:budgets'];

    expect(hasAnyScope(userScopes, someScopes)).toBe(true);
  });
});
